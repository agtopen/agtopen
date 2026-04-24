# AIP-003: Data Provider Oracle Standard

| Field | Value |
|-------|-------|
| AIP | 003 |
| Title | Data Provider Oracle Standard |
| Author | AgtOpen Core Team |
| Status | Final |
| Category | Oracle |
| Created | 2025-01-25 |

## Abstract

This specification defines the oracle standard for community data providers that supply external data feeds to the AgtOpen network. Data providers act as oracles, bridging off-chain information (prices, events, metrics) into the network's consensus pipeline. The standard covers registration, verification, schema validation, freshness requirements, aggregation weighting, and lifecycle management.

## Motivation

AI agents require reliable, timely external data to make accurate predictions and analyses. Rather than relying solely on foundation data sources, the AgtOpen network benefits from a diverse ecosystem of community-operated data providers. This standard ensures that community data feeds meet minimum quality, freshness, and reliability requirements before they influence agent decisions.

## Specification

### 1. Registration

Data providers register by declaring their data schema and endpoint.

**Endpoint:** `POST /v2/data-providers/register`

**Request body:**

```json
{
  "name": "CoinPriceOracle",
  "description": "Real-time cryptocurrency price feed from aggregated exchanges",
  "category": "price_feed",
  "endpointUrl": "https://oracle.example.com",
  "refreshIntervalMs": 60000,
  "outputSchema": {
    "type": "object",
    "properties": {
      "asset": { "type": "string" },
      "currency": { "type": "string" },
      "price": { "type": "number" },
      "volume24h": { "type": "number" },
      "source": { "type": "string" }
    },
    "required": ["asset", "currency", "price"]
  },
  "author": {
    "name": "Bob",
    "contact": "bob@example.com"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Unique provider name (3-64 chars) |
| `description` | string | Yes | What data this provider supplies (10-500 chars) |
| `category` | string | Yes | `price_feed`, `event_feed`, `metrics`, `social`, `general` |
| `endpointUrl` | string (URL) | Yes | HTTPS base URL |
| `refreshIntervalMs` | integer | Yes | How often the provider updates its data (milliseconds) |
| `outputSchema` | JSON Schema | Yes | Schema describing the structure of data responses |
| `author.name` | string | Yes | Developer name or organization |
| `author.contact` | string | Yes | Contact email |

**Response (success):**

```json
{
  "providerId": "dp_r4t5y6u7",
  "status": "pending_verification",
  "createdAt": "2025-06-01T12:00:00.000Z"
}
```

### 2. Provider Endpoint Requirements

#### 2.1 Health Check

```
GET /health
```

**Expected response** (HTTP 200):

```json
{
  "status": "ok",
  "version": "1.0.0",
  "uptime": 3600
}
```

Must respond within **10 seconds**.

#### 2.2 Data Endpoint

```
GET /data
```

**Expected response** (HTTP 200):

```json
{
  "data": {
    "asset": "BTC",
    "currency": "USD",
    "price": 67432.50,
    "volume24h": 28500000000,
    "source": "aggregated"
  },
  "timestamp": "2025-06-01T12:00:00.000Z",
  "providerId": "dp_r4t5y6u7"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `data` | object | Yes | Data payload matching the declared `outputSchema` |
| `timestamp` | string (ISO 8601) | Yes | When this data was collected or computed |
| `providerId` | string | No | Provider's self-reported identifier |

The data endpoint must respond within **15 seconds**. The `timestamp` field must reflect actual data collection time, not response generation time.

### 3. Verification Pipeline

#### 3.1 Health Check

The registry pings `GET /health`. A 200 response within 10 seconds is required. Failure results in immediate rejection.

#### 3.2 Schema Validation

The registry calls `GET /data` and validates the response against the declared `outputSchema`:

- All `required` fields must be present.
- Each field must match the declared type.
- No undeclared required fields may be missing.

Additional fields beyond the schema are permitted but ignored for validation purposes.

#### 3.3 Freshness Check

The `timestamp` in the data response must be no older than **5 minutes** from the current server time at the moment of verification.

```
freshness = now() - response.timestamp
if freshness > 300_000ms:
    reject("data_stale")
```

**Verification outcome:**
- All three checks pass: Provider advances to **Sandbox**.
- Any check fails: Provider is **rejected** with a diagnostic report. Re-registration permitted after 12 hours.

### 4. Provider Lifecycle

#### 4.1 Sandbox

| Parameter | Value |
|-----------|-------|
| Duration | 5 days minimum |
| Minimum samples | 30 |
| Minimum accuracy | 70% (compared to trusted sources) |
| Aggregation weight | 0.0 |

During sandbox, the system periodically samples the provider's `GET /data` endpoint and compares results against trusted reference sources (foundation data providers and verified community providers).

#### Accuracy Comparison Rules

| Data Type | Comparison Method | Tolerance |
|-----------|-------------------|-----------|
| Numeric | Relative deviation | 5% (`abs(actual - expected) / expected <= 0.05`) |
| String | Exact match | Case-insensitive |
| Boolean | Exact match | `actual === expected` |
| Timestamp | Absolute deviation | 60 seconds |

A sample is **accurate** if all required fields match within tolerance. Overall accuracy is `accurate_samples / total_samples`.

**Promotion to Active:** All sandbox criteria met after 5+ days.

#### 4.2 Active

| Parameter | Value |
|-----------|-------|
| Aggregation weight | `0.3 * trust_score` |
| Duration for promotion | 14 days minimum |
| Minimum data points | 1,000 |
| Minimum accuracy | 90% |
| Minimum uptime | 95% |

Uptime is measured as the percentage of health check probes (every 60 seconds) that return HTTP 200 within 10 seconds.

**Promotion to Trusted:** All criteria met.

#### 4.3 Trusted

| Parameter | Value |
|-----------|-------|
| Aggregation weight | `1.0 * trust_score` |
| Monitoring | Continuous |
| Re-verification | Monthly automated schema + freshness check |

Trusted providers serve as reference sources for sandbox and active provider comparisons.

### 5. Aggregation Weight

The aggregation weight determines how much a provider's data influences the network's composite data feed:

| Status | Weight Formula |
|--------|----------------|
| Sandbox | `0.0` |
| Active | `0.3 * trust_score` |
| Trusted | `1.0 * trust_score` |

When multiple providers supply the same data category, the network computes a weighted aggregate:

```
aggregate_value = sum(provider_value[i] * weight[i]) / sum(weight[i])
```

For numeric data, this produces a weighted average. For categorical data, the category with the highest cumulative weight wins.

### 6. Staleness Detection

The system probes each provider's `GET /data` endpoint at the provider's declared `refreshIntervalMs`. If the `timestamp` in the response has not advanced for **10 minutes**, the provider is marked as **degraded**.

| Staleness Duration | Action |
|--------------------|--------|
| 10 minutes | Status set to `degraded`, aggregation weight halved |
| 30 minutes | Status set to `stale`, aggregation weight set to 0 |
| 60 minutes | Provider suspended, removed from aggregation |

Recovery from degraded or stale status is automatic when fresh data is detected. Recovery from suspension requires re-verification.

### 7. Trust Score Integration

Provider trust scores are maintained per AIP-006:

| Event | Trust Delta |
|-------|-------------|
| Accurate sample (matches reference) | +0.005 |
| Inaccurate sample (deviates from reference) | -0.03 |
| Initial score | 0.50 |
| Suspension threshold | 0.20 |
| Trusted threshold | 0.80 |

### 8. Suspension Rules

A provider is suspended if any condition is met:

| Condition | Threshold |
|-----------|-----------|
| Rolling accuracy | < 60% (over last 50 samples) |
| Trust score | < 0.20 |
| Consecutive stale readings | 6 (at 10-min intervals = 60 minutes) |
| Health check failures | 5 consecutive |

Suspended providers must re-register and pass verification to re-enter the pipeline. Trust score resets to 0.50 upon re-entry.

### 9. API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v2/data-providers/register` | Register a new data provider |
| `GET` | `/v2/data-providers` | List all providers (filterable by status, category) |
| `GET` | `/v2/data-providers/:id` | Get provider details and current status |
| `GET` | `/v2/data-providers/:id/samples` | Get recent data samples and accuracy history |
| `POST` | `/v2/data-providers/:id/verify` | Manually trigger re-verification (admin only) |
| `DELETE` | `/v2/data-providers/:id` | Deregister a provider (owner or admin) |
| `GET` | `/v2/data-providers/aggregate/:category` | Get aggregated data for a category |

All endpoints require authentication via `Authorization: Bearer <JWT>` header.

## Security Considerations

- **Data integrity**: All data samples are timestamped and hashed upon receipt to detect retroactive tampering.
- **Sybil resistance**: Provider registration is rate-limited to 3 per account per day. Duplicate `endpointUrl` registrations are rejected.
- **Collusion detection**: If multiple providers return identical anomalous values simultaneously, the system flags them for manual review.
- **HTTPS enforcement**: Provider endpoints must use valid TLS certificates in production.

## Backwards Compatibility

AIP-003 introduces a formal lifecycle where none existed previously. Existing data integrations are migrated to Trusted status with a 60-day grace period to comply with endpoint requirements.

## Reference Implementation

See `packages/data-provider/` for the provider SDK and `apps/oracle-aggregator/` for the aggregation service.
