# AIP-008: Decentralized Inference Roadmap

| Field | Value |
|-------|-------|
| AIP | 008 |
| Title | Decentralized Inference Roadmap |
| Author | AgtOpen Core Team |
| Status | Draft |
| Category | Inference |
| Created | 2025-03-01 |
| Requires | AIP-001, AIP-005, AIP-006 |

## Abstract

This proposal defines a phased roadmap to reduce the AgtOpen network's dependency on centralized AI inference providers (OpenAI, Anthropic) by progressively shifting workloads to locally-operated Hardware Nodes running open-weight models and to browser-based WebGPU inference. The plan introduces an ElasticOrchestrator routing layer that transparently directs inference requests across three execution tiers — browser, Intel Node, and cloud API — based on task complexity, latency budget, and cost constraints. By the end of Phase C, the network targets 40% of daily inference volume served without any centralized API call.

## Motivation

The AgtOpen agent economy currently routes the majority of its inference workload through OpenAI and Anthropic APIs. This creates a single point of failure with material business risk:

> "If Sam Altman locks your API key, does your entire economy collapse?"

This question, raised during VC due diligence, exposes three structural vulnerabilities:

1. **Availability risk.** A provider outage or rate-limit change can halt all agent activity network-wide. The existing fallback chain in `ai-inference.ts` (Ollama -> OpenAI -> Anthropic -> heuristic) mitigates partial outages but still depends on at least one cloud provider being reachable.

2. **Cost risk.** At scale, per-token API pricing dominates operating costs. At 10M inference calls/month, cloud API spend exceeds $20,000/month at current rates. Intel Node operators can serve equivalent workloads at 75% lower marginal cost.

3. **Sovereignty risk.** Third-party providers can unilaterally change terms of service, introduce content filtering that conflicts with agent task requirements, or deprecate models without notice.

The network already has foundational infrastructure for decentralized inference:

- **WebGPU browser inference** (`webgpu-inference.ts`, 725 lines) — a 2-layer neural network for crypto sentiment classification running entirely in the browser via WGSL compute shaders with CPU fallback.
- **Ollama executor** (`ai-inference.ts`, 390 lines) — supports Llama 3 8B/70B, Mistral 7B, Phi-3, Gemma, and Qwen models with automatic provider fallback.
- **Hardware tier system** (`hardware-tiers.ts`) — three tiers (Titan, Apex, Sovereign) with capability scoring, task-type gating, and SLA enforcement.

This AIP formalizes the path from these building blocks to a production-grade decentralized inference layer.

## Specification

### Phase A: Intel Node Llama Deployment (Weeks 1-8)

#### A.1 Model-to-Hardware Mapping

Each hardware tier (defined in AIP-001 and `hardware-tiers.ts`) supports a specific set of open-weight models based on its minimum resource requirements:

| Model | Parameters | Quantization | Min VRAM | Min RAM | Target Tier | Inference Server |
|-------|-----------|-------------|----------|---------|-------------|-----------------|
| Llama 3 8B | 8B | FP16 | 8 GB | 16 GB | Titan (consumer GPU) | Ollama |
| Llama 3 8B | 8B | GPTQ-4bit | 4 GB | 8 GB | Titan (no GPU, CPU-only) | Ollama |
| Llama 3 70B | 70B | GPTQ-4bit | 24 GB | 64 GB | Apex | vLLM |
| Mixtral 8x7B | 46.7B (MoE) | GPTQ-4bit | 24 GB | 64 GB | Sovereign | vLLM |
| Mistral 7B | 7B | FP16 | 8 GB | 16 GB | Titan | Ollama |

**Rationale for model selection:**

- **Llama 3 8B** serves as the workhorse for routine inference tasks (sentiment analysis, data extraction, simple reasoning). The existing Ollama integration (`OLLAMA_MODEL_MAP['llama-3-8b'] = 'llama3:8b'`) requires zero additional code.
- **Llama 3 70B GPTQ-4bit** handles complex multi-step reasoning that currently requires GPT-4o. Requires vLLM for efficient batched serving on multi-GPU Apex nodes.
- **Mixtral 8x7B** provides the highest throughput via Mixture-of-Experts architecture on Sovereign nodes equipped with high-end GPUs (min 8 GB VRAM per `HARDWARE_TIER_SPECS.sovereign`).

#### A.2 Inference Server Stack

Two inference servers are supported:

**Ollama (existing integration):**
- Already integrated via `executeAiInference()` in `ai-inference.ts`
- Supports pull-based model management (`ollama pull llama3:8b`)
- Optimal for single-GPU Titan nodes running 7B-8B models
- Health check endpoint: `GET /api/tags` (used by `isOllamaAvailable()`)

**vLLM (new integration):**
- Required for 70B+ models that need tensor parallelism across multiple GPUs
- PagedAttention for efficient KV-cache management
- Continuous batching for high-throughput serving
- OpenAI-compatible API (`/v1/chat/completions`), allowing reuse of the existing `inferOpenAI()` code path with a local `OPENAI_BASE_URL` override

```
# vLLM launch command for Apex nodes
vllm serve meta-llama/Meta-Llama-3-70B-Instruct-GPTQ \
  --quantization gptq \
  --tensor-parallel-size 2 \
  --max-model-len 8192 \
  --port 8000
```

#### A.3 Intel Node Operator Setup

Node operators follow this sequence to enable inference:

1. **Hardware qualification.** The node registers via AIP-001 `handshake_request` with GPU capabilities in `capabilities.gpu`. The coordinator evaluates tier eligibility using `assessTierEligibility()` from `hardware-tiers.ts`.

2. **Model pull.** On tier assignment, the node pulls the approved model for its tier:
   ```bash
   # Titan node
   ollama pull llama3:8b

   # Apex node (vLLM)
   huggingface-cli download TheBloke/Llama-3-70B-Instruct-GPTQ --local-dir /models/llama3-70b-gptq
   ```

3. **Inference readiness.** The node reports `"ai_inference"` in `capabilities.supportedTaskTypes` during the next handshake. The coordinator begins assigning `task_assign` messages with `taskType: "inference"`.

4. **Model verification.** On first inference task, the coordinator sends a known-answer probe. The node's response hash (`resultHash` per AIP-001 Section 5) is compared against the expected output. Nodes failing verification are excluded from inference routing.

#### A.4 Deliverables

| Week | Milestone |
|------|-----------|
| 1-2 | vLLM integration module with OpenAI-compatible adapter |
| 3-4 | Model verification probe system and allowlist registry |
| 5-6 | Automated model pull on tier assignment |
| 7-8 | Load testing: 1,000 concurrent inference requests across 10 Titan nodes |

---

### Phase B: Inference Routing System (Weeks 6-12)

#### B.1 ElasticOrchestrator

The ElasticOrchestrator is the central routing component that decides where each inference request executes. It evaluates three candidate routes for every request:

```
Priority 1: Browser WebGPU    (zero cost, highest privacy, limited model size)
Priority 2: Intel Node         (low cost, low latency, open-weight models)
Priority 3: Cloud API          (highest cost, highest capability, fallback)
```

**Routing decision algorithm:**

```
function route(request: InferenceRequest): ExecutionTarget {
  complexity = SemanticRouter.classify(request.prompt)

  if (complexity == SIMPLE && request.agent.browserCapable) {
    profile = HardwareProfiler.getDeviceProfile(request.agent.deviceId)
    if (profile.webgpuAvailable && profile.estimatedLatencyMs < request.budgetMs) {
      return { target: BROWSER, model: "sentiment-2layer" }
    }
  }

  if (complexity <= MODERATE) {
    node = NodeRegistry.findNearest(request.agent.region, "ai_inference")
    if (node && node.currentLoad < 0.8) {
      model = selectModelForComplexity(complexity, node.tier)
      return { target: INTEL_NODE, nodeId: node.id, model: model }
    }
  }

  // Fallback: cloud API
  return { target: CLOUD_API, provider: selectCheapestProvider(request) }
}
```

#### B.2 Semantic Router Integration

The Semantic Router (referenced in AIP-005) classifies incoming prompts into complexity tiers that determine routing eligibility:

| Complexity Tier | Description | Example Tasks | Eligible Routes |
|----------------|-------------|---------------|-----------------|
| `SIMPLE` | Pattern matching, classification, extraction | Sentiment analysis, entity extraction, yes/no questions | Browser, Intel Node, Cloud |
| `MODERATE` | Single-step reasoning, summarization | Market analysis, data synthesis, short-form generation | Intel Node, Cloud |
| `COMPLEX` | Multi-step reasoning, long-form generation | Strategy formulation, code generation, research synthesis | Cloud (GPT-4o / Claude 3) |

Classification uses a lightweight embedding model (< 50ms overhead) that runs on the coordinator. Misclassification fallback: if an Intel Node returns a low-confidence result (< 0.6), the request is automatically re-routed to cloud.

#### B.3 Hardware-Aware Profiling

On browser extension install, the client runs a hardware benchmark to populate a device profile:

```typescript
interface DeviceProfile {
  deviceId: string;
  webgpuAvailable: boolean;
  gpuVendor: string;            // e.g., "apple", "nvidia", "intel"
  gpuArchitecture: string;      // e.g., "apple-m2", "ada-lovelace"
  estimatedTflops: number;      // measured via benchmark shader
  maxBufferSizeMb: number;      // WebGPU buffer limit
  availableMemoryMb: number;    // navigator.deviceMemory * 1024
  benchmarkLatencyMs: number;   // time to run reference inference
  profiledAt: number;           // timestamp
}
```

The benchmark dispatches the existing WebGPU sentiment model (`executeWebGpuInference()` from `webgpu-inference.ts`) three times and records median latency. Devices with `benchmarkLatencyMs > 500` are excluded from browser inference routing.

#### B.4 Cost / Latency / Accuracy Trade-offs

| Route | Avg Latency | Cost per Call | Model Capability | Privacy |
|-------|------------|---------------|-----------------|---------|
| Browser WebGPU | 5-50ms | $0.000 | Limited (small NN) | Full (no data leaves device) |
| Intel Node (Titan, 8B) | 200-800ms | $0.0005 | Moderate | High (data stays in network) |
| Intel Node (Apex, 70B) | 500-2000ms | $0.001 | High | High |
| Cloud API (GPT-4o) | 300-1500ms | $0.002 | Highest | Low (third-party) |
| Cloud API (Claude 3 Haiku) | 200-800ms | $0.0003 | Moderate-High | Low |

#### B.5 Deliverables

| Week | Milestone |
|------|-----------|
| 6-7 | Semantic Router complexity classifier (SIMPLE / MODERATE / COMPLEX) |
| 8-9 | ElasticOrchestrator v1 with 2-tier routing (Intel Node + Cloud) |
| 10 | Hardware-Aware Profiler integrated into browser extension |
| 11-12 | Full 3-tier routing with automated fallback and re-routing |

---

### Phase C: Browser-Scale Inference (Weeks 10-16)

#### C.1 Llama.cpp WASM Integration

Replace the current 2-layer sentiment network with a general-purpose 7B parameter model running in the browser via llama.cpp compiled to WebAssembly:

- **Runtime:** llama.cpp WASM build with WebGPU backend (`LLAMA_WASM=1 LLAMA_WEBGPU=1`)
- **Target model:** Llama 3 8B GGUF Q4_K_M quantization (~4.3 GB)
- **Execution:** Web Worker to avoid blocking the main thread
- **Token throughput target:** 8-15 tokens/second on M-series Macs, 5-10 on discrete NVIDIA GPUs

#### C.2 Model Distribution

Models are distributed via Cloudflare R2 edge storage:

```
https://models.agtopen.com/gguf/llama3-8b-q4km/
  manifest.json          (model metadata, chunk list, checksums)
  chunk-000.bin          (256 MB)
  chunk-001.bin          (256 MB)
  ...
  chunk-016.bin          (remaining bytes)
```

**Progressive download protocol:**

1. Client fetches `manifest.json` (< 1 KB) containing SHA-256 checksums per chunk.
2. Chunks download in parallel (up to 4 concurrent) using `fetch()` with `Range` headers.
3. Each chunk is verified against its manifest checksum before being written to the Cache API.
4. UI displays progress: `"Syncing intelligence... 50%"` with estimated time remaining.
5. On completion, the full model is assembled in an IndexedDB blob store.

**Resume support:** If the browser closes mid-download, cached chunks are retained. On next visit, only missing chunks are fetched.

#### C.3 WebGPU Acceleration

The existing WebGPU infrastructure in `webgpu-inference.ts` provides the foundation. Phase C extends it from a fixed 2-layer network to a general-purpose transformer execution engine:

| Hardware | Expected Performance | WebGPU Support |
|----------|---------------------|---------------|
| Apple M1/M2/M3 | 10-15 tok/s (8B Q4) | Native via Metal backend |
| NVIDIA RTX 3060+ | 8-12 tok/s (8B Q4) | Via Vulkan/Dawn backend |
| Intel Arc | 5-8 tok/s (8B Q4) | Via Vulkan backend |
| CPU-only (fallback) | 1-3 tok/s (8B Q4) | WASM SIMD only |

**Minimum viable device:** 8 GB unified/system memory, WebGPU-capable browser (Chrome 113+, Edge 113+).

#### C.4 Browser Cache Strategy

Model weights persist across sessions using a tiered caching strategy:

| Layer | Storage | Capacity | Eviction |
|-------|---------|----------|----------|
| Cache API | HTTP cache | Up to 4 GB per origin | LRU, browser-managed |
| IndexedDB | Blob store | Up to 2 GB assembled model | Manual, version-keyed |
| OPFS (Origin Private File System) | File system | Up to 10 GB | Manual, preferred on supported browsers |

**Version management:** Each model version is keyed by `{model_name}-{quantization}-{version_hash}`. When a new model version is published, the old version is evicted after the new one is fully cached.

#### C.5 Deliverables

| Week | Milestone |
|------|-----------|
| 10-11 | llama.cpp WASM+WebGPU build pipeline, Web Worker executor |
| 12-13 | Cloudflare R2 model distribution with progressive download |
| 14 | IndexedDB/OPFS caching with resume support |
| 15-16 | Integration with ElasticOrchestrator: browser route serves 7B inference |

---

## Technical Specifications

### Inference Task Schema

All inference requests follow the `task_assign` envelope defined in AIP-001 Section 4.4, with the following `input` payload for `taskType: "inference"`:

```json
{
  "taskId": "task_9f8e7d6c5b4a",
  "taskType": "inference",
  "priority": 5,
  "timeoutMs": 30000,
  "input": {
    "agentId": "agent_abc123",
    "prompt": "Analyze BTC/USDT order book imbalance and predict 1h direction",
    "constraints": {
      "maxTokens": 512,
      "temperature": 0.3,
      "requiredCapability": "market_analysis",
      "preferLocal": true
    },
    "budget": {
      "maxCostUsd": 0.005,
      "maxLatencyMs": 5000,
      "minConfidence": 0.7
    }
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agentId` | string | Yes | Requesting agent identifier |
| `prompt` | string | Yes | The inference prompt |
| `constraints.maxTokens` | integer | No | Maximum output tokens (default: 256) |
| `constraints.temperature` | float | No | Sampling temperature (default: 0.3) |
| `constraints.requiredCapability` | string | No | Semantic category for routing |
| `constraints.preferLocal` | boolean | No | Prefer non-cloud routes when possible |
| `budget.maxCostUsd` | float | No | Maximum acceptable cost for this call |
| `budget.maxLatencyMs` | integer | No | Maximum acceptable end-to-end latency |
| `budget.minConfidence` | float | No | Minimum acceptable confidence score |

### Inference Output Schema

```json
{
  "taskId": "task_9f8e7d6c5b4a",
  "status": "completed",
  "result": {
    "prediction": "bullish",
    "confidence": 0.87,
    "reasoning": "Order book shows 3.2x buy-side imbalance...",
    "latencyMs": 420,
    "modelUsed": "llama3:8b",
    "provider": "intel_node",
    "nodeId": "node_a1b2c3d4e5f6",
    "proofHash": "0x7a3f...b8c1"
  },
  "resultHash": "a3f2b8c1",
  "executionMs": 450
}
```

| Field | Type | Description |
|-------|------|-------------|
| `prediction` | string | The inference output classification or text |
| `confidence` | float | Model confidence score (0-1) |
| `reasoning` | string | Explanation text (first 500 chars) |
| `latencyMs` | integer | Pure inference time in milliseconds |
| `modelUsed` | string | Actual model identifier that served the request |
| `provider` | string | Execution route: `"browser"`, `"intel_node"`, or `"cloud_api"` |
| `nodeId` | string | Intel Node ID (if applicable), null for browser/cloud |
| `proofHash` | string | ZK verification hash (see Security section) |

### Fallback Conditions

The ElasticOrchestrator triggers automatic fallback escalation under these conditions:

| Condition | Threshold | Action |
|-----------|-----------|--------|
| Inference timeout | > 30,000ms | Escalate to next route tier |
| Error rate (rolling 5min) | > 5% | Temporarily blacklist route |
| Confidence below minimum | < `budget.minConfidence` | Re-route to higher-capability model |
| Node overloaded | `activeTasks >= maxTasks` | Route to next available node |
| Model not loaded | Ollama returns 404 | Skip node, log model-pull reminder |
| WebGPU context lost | Device `GPUDevice.lost` event | Fall back to CPU, then Intel Node |

Fallback follows the existing pattern established in `ai-inference.ts`: Ollama -> OpenAI -> Anthropic -> heuristic. AIP-008 extends this to: Browser -> Intel Node -> Cloud API -> heuristic.

### ZK Verification

Inference integrity is verified through two mechanisms depending on execution route:

**Intel Node (TEE attestation):**
- Sovereign nodes with TEE enclaves (`hasTeeEnclave: true` in `HardwareCapabilities`) generate hardware attestation reports.
- The attestation binds the model weights hash, input hash, and output hash into a signed statement.
- Nodes without TEE use dual-execution verification: the coordinator re-executes 5% of tasks on a second node and compares `resultHash` values.

**Cloud API (zkTLS):**
- TLS session transcripts from cloud API calls are captured and verified using zkTLS proofs.
- The proof demonstrates that a specific prompt was sent to `api.openai.com` (or equivalent) and a specific response was received, without revealing the API key.
- Proof generation adds approximately 200ms overhead per request.

**Browser (local verification):**
- Browser inference is inherently trusted (the user's own device).
- The `resultHash` (FNV-1a per AIP-001 Section 5) is included for consistency but is not independently verified.

---

## Economics

### Reward Structure

Intel Node operators earn ATOMS (the network's micro-reward unit) and AGT tokens for serving inference tasks:

```
inferenceReward = baseReward * tierMultiplier * (0.5 + 0.3 * qualityScore + 0.2 * slaScore)
```

This formula mirrors the existing `estimateHardwareReward()` function in `hardware-tiers.ts`. The `baseReward` for inference tasks is calibrated to be competitive with cloud API pricing:

| Tier | Reward Multiplier | Base Reward (ATOMS) | Effective USD/call | Cloud Equivalent |
|------|------------------|--------------------|--------------------|-----------------|
| Titan (8B) | 2.0x | 50 ATOMS | ~$0.0005 | GPT-4o-mini ($0.0003) |
| Apex (70B) | 3.0x | 75 ATOMS | ~$0.001 | GPT-4o ($0.002) |
| Sovereign (Mixtral) | 4.0x | 100 ATOMS | ~$0.0015 | Claude 3 Opus ($0.015) |
| Browser | N/A | 10 ATOMS (user credit) | $0.000 | N/A |

Browser inference earns a small ATOMS credit for the user's agent, incentivizing local execution.

### Cost Comparison

| Route | Cost/Call | Monthly Cost (10M calls) | Savings vs Cloud |
|-------|----------|--------------------------|------------------|
| Cloud API (blended) | $0.002 | $20,000 | Baseline |
| Intel Node (blended) | $0.0005 | $5,000 | 75% |
| Browser | $0.000 | $0 | 100% |
| **Target blend (40% local)** | **$0.0012** | **$12,000** | **40%** |

### Target: 40% Local Inference

By the end of Phase C (Week 16), the network targets the following inference distribution:

| Route | % of Daily Volume | Primary Workload |
|-------|-------------------|-----------------|
| Browser WebGPU | 10% | Sentiment classification, simple extraction |
| Intel Node | 30% | Market analysis, summarization, moderate reasoning |
| Cloud API | 60% | Complex reasoning, code generation, long-form |

This 40% local target reduces monthly cloud API spend by approximately $8,000 at 10M calls/month scale and eliminates single-provider dependency for nearly half of all inference volume.

---

## Security

### Malicious Node Detection

Operators have economic incentive to return fabricated results (lower compute cost, same reward). The network defends against this with:

1. **Challenge probes.** The coordinator periodically dispatches inference tasks with known-correct outputs. Nodes returning incorrect results receive a trust score penalty (per AIP-006). Three consecutive probe failures trigger automatic de-registration.

2. **Secondary inference validation.** For high-value tasks (`priority >= 8`), the coordinator dispatches the same prompt to two independent nodes. Results are compared using semantic similarity (cosine distance on embeddings). Divergence above threshold 0.3 triggers a third-node tiebreaker.

3. **Statistical anomaly detection.** Nodes whose confidence distributions deviate significantly from network baselines (KL divergence > 2.0) are flagged for review. This catches nodes that always return high confidence regardless of input difficulty.

### Model Allowlist

Only verified model checkpoints are permitted on the network:

```json
{
  "allowlist": [
    {
      "modelId": "llama3:8b",
      "sha256": "a1b2c3d4...",
      "source": "https://huggingface.co/meta-llama/Meta-Llama-3-8B-Instruct",
      "verifiedAt": "2025-03-01T00:00:00Z",
      "allowedTiers": ["titan", "apex", "sovereign"]
    },
    {
      "modelId": "llama3:70b-gptq",
      "sha256": "e5f6a7b8...",
      "source": "https://huggingface.co/TheBloke/Llama-3-70B-Instruct-GPTQ",
      "verifiedAt": "2025-03-01T00:00:00Z",
      "allowedTiers": ["apex", "sovereign"]
    }
  ]
}
```

Nodes reporting a `modelUsed` value not on the allowlist have their inference results rejected and their trust score penalized.

### Prompt Sanitization

All prompts are sanitized before dispatch to Intel Nodes to prevent:

- **Prompt injection:** Inputs containing instruction-override patterns are stripped or rejected.
- **Data exfiltration:** Prompts requesting the model to output its system prompt, API keys, or node configuration are blocked.
- **Resource exhaustion:** Prompts with `maxTokens > 4096` or pathological repetition patterns are truncated.

Sanitization runs on the coordinator before routing, adding < 5ms overhead.

---

## Success Metrics

### Primary KPIs

| Metric | Baseline (Today) | Phase A Target | Phase B Target | Phase C Target |
|--------|-------------------|----------------|----------------|----------------|
| % daily inferences via local routes | 0% | 5% (Intel Node only) | 20% (Intel Node) | 40% (30% Intel + 10% Browser) |
| Average latency (local route) | N/A | < 1,000ms (8B) | < 800ms (routed) | < 500ms (blended) |
| Cost per inference (blended) | $0.002 | $0.0019 | $0.0015 | $0.0012 |
| Cloud API dependency | 100% | 95% | 80% | 60% |
| Inference availability (99.9th pctl) | 99.5% | 99.7% | 99.9% | 99.95% |

### Monitoring

All inference events emit structured telemetry:

```json
{
  "event": "inference_complete",
  "taskId": "task_9f8e7d6c5b4a",
  "route": "intel_node",
  "nodeId": "node_a1b2c3d4e5f6",
  "model": "llama3:8b",
  "latencyMs": 420,
  "confidence": 0.87,
  "costUsd": 0.0005,
  "fallbackUsed": false,
  "timestamp": "2025-06-01T12:02:02.500Z"
}
```

Dashboards aggregate these events to track KPI progress in real time.

---

## Backwards Compatibility

AIP-008 is fully backward-compatible with the existing inference pipeline:

1. **Existing Claude/OpenAI API calls continue working.** The `executeAiInference()` function in `ai-inference.ts` remains the entry point. The ElasticOrchestrator wraps this function, adding routing logic upstream. If all local routes are unavailable, the system degrades to the current behavior: Ollama -> OpenAI -> Anthropic -> heuristic fallback.

2. **Transparent routing.** Agents submit inference requests using the same `task_assign` schema defined in AIP-001. The `provider` field in the response indicates which route served the request, but agents are not required to inspect or act on this field. From the agent's perspective, the inference API is unchanged.

3. **No protocol version bump required.** AIP-008 adds new optional fields to the `task_assign.input` schema (`constraints`, `budget`) but does not modify any existing required fields. Nodes running older client versions ignore unrecognized fields per standard JSON processing.

4. **Hardware tier compatibility.** The `ai_inference` task type already exists in `HARDWARE_TIER_SPECS.sovereign.allowedTaskTypes`. AIP-008 extends inference eligibility to Titan and Apex tiers for smaller models, which requires only a coordinator-side configuration change (no node software update).

## Reference Implementation

- `apps/web/app/node/executors/webgpu-inference.ts` — Browser WebGPU inference executor (Phase C foundation)
- `apps/agent-engine/src/node-network/hardware-executors/ai-inference.ts` — Ollama/OpenAI/Anthropic executor (Phase A foundation)
- `apps/agent-engine/src/node-network/hardware-tiers.ts` — Hardware tier definitions and capability scoring
- `apps/agent-engine/src/node-network/elastic-orchestrator.ts` — ElasticOrchestrator routing engine (Phase B, new)
- `apps/agent-engine/src/node-network/semantic-router.ts` — Prompt complexity classifier (Phase B, new)
- `apps/web/app/node/executors/llama-wasm.ts` — llama.cpp WASM browser executor (Phase C, new)
