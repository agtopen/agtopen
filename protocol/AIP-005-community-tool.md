# AIP-005: Community Tool Interface

| Field | Value |
|-------|-------|
| AIP | 005 |
| Title | Community Tool Interface |
| Author | AgtOpen Core Team |
| Status | Final |
| Category | Tool |
| Created | 2025-02-05 |

## Abstract

This specification defines the MCP-compatible tool interface for extending AgtOpen agent capabilities through community-developed tools. Tools are stateless HTTP services that agents can invoke to perform specific operations — web searches, calculations, API integrations, data transformations, and more. The standard covers tool registration, schema discovery, verification, reliability tracking, and lifecycle management.

## Motivation

Foundation agents ship with a fixed set of built-in capabilities. Community tools allow the ecosystem to expand agent functionality without modifying core agent code. By standardizing the tool interface around the Model Context Protocol (MCP) pattern — schema discovery plus typed execution — any developer can contribute tools that all agents in the network can use.

## Specification

### 1. Registration

Tool developers register by declaring their tool's capabilities and endpoint.

**Endpoint:** `POST /v2/tools/register`

**Request body:**

```json
{
  "name": "web-search",
  "description": "Search the web and return summarized results",
  "category": "search",
  "endpointUrl": "https://my-tool.example.com",
  "exampleInput": {
    "query": "AgtOpen token price",
    "maxResults": 5
  },
  "author": {
    "name": "Charlie",
    "contact": "charlie@example.com"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Unique tool name (3-64 chars, lowercase alphanumeric + hyphens) |
| `description` | string | Yes | What this tool does (10-500 chars) |
| `category` | string | Yes | `search`, `computation`, `integration`, `transformation`, `utility` |
| `endpointUrl` | string (URL) | Yes | HTTPS base URL of the tool's API |
| `exampleInput` | object | Yes | A sample input for verification testing |
| `author.name` | string | Yes | Developer name or organization |
| `author.contact` | string | Yes | Contact email |

**Response (success):**

```json
{
  "toolId": "tool_h8j9k0l1",
  "status": "pending_verification",
  "createdAt": "2025-06-01T12:00:00.000Z"
}
```

### 2. Tool Endpoint Requirements

Every registered tool MUST expose the following HTTP endpoints at its `endpointUrl`:

#### 2.1 Health Check

```
GET /health
```

**Expected response** (HTTP 200):

```json
{
  "status": "ok",
  "version": "1.0.0",
  "uptime": 7200
}
```

Must respond within **5 seconds**.

#### 2.2 Schema Discovery

```
GET /schema
```

**Expected response** (HTTP 200):

```json
{
  "name": "web-search",
  "description": "Search the web and return summarized results",
  "input": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Search query"
      },
      "maxResults": {
        "type": "integer",
        "description": "Maximum number of results to return",
        "default": 10,
        "minimum": 1,
        "maximum": 50
      }
    },
    "required": ["query"]
  },
  "output": {
    "type": "object",
    "properties": {
      "results": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "title": { "type": "string" },
            "url": { "type": "string" },
            "snippet": { "type": "string" }
          }
        }
      },
      "totalResults": { "type": "integer" }
    }
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Tool name (must match registration) |
| `description` | string | Yes | Human-readable description |
| `input` | JSON Schema | Yes | Schema defining accepted input parameters |
| `output` | JSON Schema | Yes | Schema defining the structure of output |

The schema endpoint must respond within **5 seconds** and return consistent results across calls.

#### 2.3 Execution

```
POST /execute
```

**Request body:**

```json
{
  "toolCallId": "call_x1y2z3",
  "input": {
    "query": "AgtOpen token price",
    "maxResults": 5
  }
}
```

**Expected response** (HTTP 200):

```json
{
  "toolCallId": "call_x1y2z3",
  "output": {
    "results": [
      {
        "title": "AGT Token Price | CoinGecko",
        "url": "https://coingecko.com/en/coins/agtopen",
        "snippet": "AGT current price, market cap, and trading volume..."
      }
    ],
    "totalResults": 1
  },
  "executionMs": 1200
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `toolCallId` | string | Yes | Echoed from request for correlation |
| `output` | object | Yes | Result matching the declared output schema |
| `executionMs` | integer | No | Self-reported execution time in ms |

**Error response** (HTTP 4xx/5xx):

```json
{
  "toolCallId": "call_x1y2z3",
  "error": {
    "code": "invalid_input",
    "message": "Query parameter is required"
  }
}
```

The execution endpoint has a default timeout of **30 seconds**. Tools requiring longer processing should return an estimated completion time and support polling.

### 3. Verification Pipeline

Upon registration, the system performs automated verification:

#### Step 1: Health Check

Ping `GET /health`. Must return HTTP 200 within 5 seconds.

#### Step 2: Schema Validation

Call `GET /schema` and validate:
- `name` matches the registered name.
- `input` is a valid JSON Schema object.
- `output` is a valid JSON Schema object.
- All required fields are present.

#### Step 3: Test Execution

Call `POST /execute` with the `exampleInput` provided during registration:
- Response must return HTTP 200.
- `output` must validate against the declared output schema.
- Response must arrive within 30 seconds.

**Verification outcome:**
- All three steps pass: Tool advances to **Sandbox**.
- Any step fails: Tool is **rejected** with a diagnostic report. Re-registration permitted after 12 hours.

### 4. Tool Lifecycle

#### 4.1 Sandbox

| Parameter | Value |
|-----------|-------|
| Duration | 5 days minimum |
| Minimum calls | 20 |
| Minimum reliability | 80% |
| Status | Available to agents with `sandbox_tools` permission |

During sandbox, the tool is made available to a limited set of test agents. Each invocation is tracked for reliability.

**Reliability** = `successful_calls / total_calls`, where a successful call is one that returns HTTP 200 with output matching the declared schema within the timeout.

**Promotion to Active:** All sandbox criteria met after 5+ days.

#### 4.2 Active

| Parameter | Value |
|-----------|-------|
| Duration for promotion | 14 days minimum |
| Minimum calls | 500 |
| Minimum reliability | 95% |
| Status | Available to all agents |

Active tools are available to all agents in the network. Performance is continuously monitored.

**Promotion to Trusted:** All criteria met.

#### 4.3 Trusted

| Parameter | Value |
|-----------|-------|
| Status | Available to all agents, featured in tool directory |
| Monitoring | Continuous |
| Re-verification | Monthly automated health + schema + test call |

Trusted tools are highlighted in the network's tool directory and may receive priority routing from agents.

### 5. Reliability Tracking

The system tracks two reliability metrics for each tool:

#### Success Rate

```
success_rate = successful_calls / total_calls (rolling 7-day window)
```

A call is successful if:
1. HTTP response status is 200.
2. The `output` field validates against the declared output schema.
3. The response arrives within the timeout (default 30s).

#### Latency Tracking

| Metric | Description |
|--------|-------------|
| `avg_latency_ms` | Mean execution time over rolling 7-day window |
| `p95_latency_ms` | 95th percentile execution time |

Agents MAY use latency metrics to prefer faster tools when multiple tools serve the same function.

### 6. Trust Score Integration

Tool trust scores are maintained per AIP-006:

| Event | Trust Delta |
|-------|-------------|
| Successful execution | +0.005 |
| Failed execution (error/timeout/schema mismatch) | -0.03 |
| Initial score | 0.50 |
| Suspension threshold | 0.20 |

### 7. Suspension Rules

A tool is suspended if any condition is met:

| Condition | Threshold |
|-----------|-----------|
| Rolling reliability (7-day) | < 70% |
| Trust score | < 0.20 |
| Consecutive failures | 10 |
| Health check failures | 5 consecutive |
| Schema change without re-registration | Immediate |

Suspended tools are removed from the tool directory and become unavailable to agents. Re-registration and full re-verification are required to re-enter the pipeline. Trust score resets to 0.50.

### 8. Schema Versioning

If a tool's input or output schema changes, the developer MUST:

1. Update the tool's `GET /schema` endpoint.
2. Re-register the tool with `POST /v2/tools/register` (creates a new version).
3. The previous version remains available for 30 days to allow agents to migrate.

Schema changes detected without re-registration (i.e., the `GET /schema` response differs from the registered schema) trigger immediate suspension.

### 9. API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v2/tools/register` | Register a new tool |
| `GET` | `/v2/tools` | List all tools (filterable by status, category) |
| `GET` | `/v2/tools/:id` | Get tool details, schema, and metrics |
| `GET` | `/v2/tools/:id/schema` | Get the tool's registered input/output schema |
| `POST` | `/v2/tools/:id/execute` | Proxy execution through the network (for agents) |
| `GET` | `/v2/tools/:id/metrics` | Get reliability and latency metrics |
| `POST` | `/v2/tools/:id/verify` | Manually trigger re-verification (admin only) |
| `DELETE` | `/v2/tools/:id` | Deregister a tool (owner or admin) |

All endpoints require authentication via `Authorization: Bearer <JWT>` header.

## Security Considerations

- **Sandboxing**: Tool execution is proxied through the network, preventing agents from directly contacting arbitrary URLs. The proxy enforces timeout, payload size limits (max 1MB request, 5MB response), and response schema validation.
- **Input sanitization**: The proxy validates agent-provided inputs against the tool's declared input schema before forwarding to the tool endpoint.
- **Rate limiting**: Tools are rate-limited to 100 calls per minute per tool. Agents are rate-limited to 20 tool calls per minute.
- **HTTPS enforcement**: Tool endpoints must use valid TLS certificates in production.
- **No secrets in schemas**: Tool schemas must not require API keys or credentials as input parameters. If a tool requires external API access, the tool operator manages those credentials server-side.

## Backwards Compatibility

AIP-005 is a new system. No prior tool interface standard existed. Tools developed during the beta period must re-register under this standard within 60 days of protocol activation.

## Reference Implementation

See `packages/tool-sdk/` for the community tool development kit and `apps/tool-proxy/` for the execution proxy service.
