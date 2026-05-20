---
title: "Tracing AI Agent Calls Across Service Boundaries with OTel Collector and Galileo"
seoTitle: "demo distributed tracing otel collector and galileo"
seoDescription: "demo for showcasing distributed tracing using multiple application services+OTel Collector+Galileo Observability"
datePublished: 2026-03-26T04:56:43.639Z
cuid: cmn702xdh00op2dmmgjvs3pa4
slug: tracing-ai-agent-calls-across-service-boundaries-with-otel-collector-and-galileo
cover: https://cdn.hashnode.com/uploads/covers/62ffcbec67b2030c206c2908/647cdf25-fb63-432a-930f-7a474e1ed78b.png
ogImage: https://cdn.hashnode.com/uploads/og-images/62ffcbec67b2030c206c2908/54e07773-ca40-4bb1-987e-ce9c82a31e44.png
tags: distributed-tracing, otel-collector, galileo-gen-ai-observability

---

![Alt text](https://kams-blog-vids.s3.us-east-1.amazonaws.com/Screenshot%202026-03-25%20at%209.41.30%E2%80%AFPM.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIA52P7DS6QCGZPHE2I%2F20260326%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260326T045202Z&X-Amz-Expires=300&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEPX%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLWVhc3QtMSJHMEUCIBanpf4qRO5DsnqPhdUvULfvCTdnRUKlV81Se6LDBDX3AiEAm5kRFfbahnhs0rlIRHQL9Nqwpy6Ff7YYx9AFxlOc63Aq4wIIvv%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FARABGgw5NTAyNTk2NTI1MTIiDGUIVFM2thO0GtoT%2Biq3AoFFZwr8fecR2arQq%2BE2kGgHWsr84XknaydMmiI97H%2BEyf3S3fgM%2BeC8cV5QYre%2BQBS3sND3YbFxhQd2x2ixeltayUh5jhzM0sk6vfT2hn1zpN4CIn2P3aiQMYeV9kVr9aBg3aLUOw5gi5WQ%2F4xrYkOCthCpeO3jzq4pM1E5czAmMwNreXpcDFQ7tDxXLwYfW%2Fv05stDGrwI%2Bk0RbleESX%2BkDRT2fSaqwpFJ8fTcsiK3iDJ70xUohKDC%2F%2BfoeSvAFTmCUpFgpS8sQrk95nBXpL5b2PAygYE40NWuVk9a6gd5SQnKtuS%2FTAv2qB1PT5YeFaXSxZf5MCVZwbMp%2FE4FBKqV%2BxuRxcikiHz6l62WKE0fFZr2uWPiuiC4nOdbmuJuQf7FxQt6rzvfHO2DzusTV9OaE9xJa4q%2BMMnzks4GOq0CFusKEFeDj1JZcQIZoBsqU0ianUQCXNgcWxa7cZhm7aX5byf53Uw5siOhNcaY%2BrncF1ez2KEHRixeFn983HaSi9iTkDO093xkY7XZG21D%2FsGMk7vZT1rIi8Gc2zDIFBgFq%2Fp1FB5eQl%2F7CZ21WdigSZOQDpEKB7ysg1%2Bi3krYQ%2BA4USQATtN861pdGRtF6TYk%2FPZ0l9d1osx7I%2BHJZPaCSPAZWH%2BWmCKFD3c851loZbWVaIuJHizIw%2F9wJIjgbCjNwm8O6%2F49gTpZ03EdpbFzgjkQFYJrqWF5ZLPe7nFHSxXTGLPdpyRnUpmwxREt6BdITgLqvyei0i%2Fcdvq9lBbs0w06oeypIxOPQKTkBTe3ukCe92IfyVvkELIZdq6RHemkiJk90eCvXPIvGQTc5Q%3D%3D&X-Amz-Signature=5b2416494d0790182e4bba25ee74344eb4c530842472d8a075808336a7aef257&X-Amz-SignedHeaders=host&response-content-disposition=inline)

## I. Introduction: The Observability Problem in Multi-Service AI Apps
- The rise of multi-service architectures — especially with AI agents spanning multiple runtimes
- Why logs and metrics alone don't cut it: the need to *follow a request* across service boundaries
- What distributed tracing gives you: a single trace ID that travels end-to-end
- Brief preview of what the demo builds: Python/LangGraph → TypeScript/Express, unified in Galileo

---

## II. The Stack at a Glance
- **Service A**: Python + FastAPI + LangGraph (entry point, orchestrates the agent graph)
- **Service B**: TypeScript + Express (downstream agent logic — LLM calls, tool use)
- **OTel Collector**: the central telemetry hub — receives, batches, and fans out spans
- **Galileo Observability**: the trace visualization and LLM observability backend
- Quick architecture diagram walkthrough (the ASCII diagram from the README is blog-ready)

---

## III. How Context Propagation Works (The "Magic" Explained)
- What `traceparent` is and why it matters (W3C Trace Context standard)
- How Service A's `opentelemetry-instrumentation-httpx` auto-injects the header on outbound calls — no manual code
- How Service B's `@opentelemetry/instrumentation-http` auto-extracts it on the inbound side
- Result: all spans in both services share the same `trace_id`
- Key insight: **auto-instrumentation means you don't touch your business logic**

---

## IV. Instrumentation Deep Dive

### Service A (Python)
- `tracing.py`: setting up the OTel SDK, configuring the OTLP exporter pointed at the Collector
- FastAPI auto-instrumentation: server spans created automatically on each request
- LangGraph node (`call_ts_service`) — how the graph triggers the cross-service call via `httpx`

### Service B (TypeScript)
- `tracing.ts`: SDK initialization, registering HTTP + Express instrumentation
- `server.ts`: Express route receiving the propagated context; `USE_REAL_LLM` env var read here (server.ts:20) and passed into the agent
- `agent.ts`: the downstream agent logic (invoke_agent → chat → tool → chat cycle)
  - Mode branching at agent.ts:106 and agent.ts:194 — mock vs. real LLM path
  - In real mode, `realLLMCall` (agent.ts:10–50) calls OpenAI; tool execution still uses mock (agent.ts:167)
- `mock-llm.ts`: simulated LLM responses — the **default run mode** (`USE_REAL_LLM=false`)
  - Important note: this is a deliberate design choice, not a placeholder. The demo is fully functional without an OpenAI key.
  - `USE_REAL_LLM=true` swaps in real OpenAI reasoning while keeping tool execution mocked — a useful middle ground for testing

---

## V. The OTel Collector: Glue Between Services and Backend
- Why route through a Collector instead of exporting directly to Galileo
  - Decoupling: services don't need to know about the backend
  - Batching: `batch` processor with 5s timeout and 512-span batch size
  - Fan-out: same spans go to both Galileo (OTLP/HTTP) and stdout debug
- Walking through `otel-collector-config.yaml`:
  - Receivers: OTLP over gRPC (4317) and HTTP (4318)
  - Exporters: `otlphttp/galileo` with API key + project headers; `debug` for local visibility
  - Pipeline: `otlp → batch → [galileo, debug]`

---

## VI. Running It Locally
- Prerequisites: Docker, `.env` file with Galileo credentials
- `docker compose up -d` — brings up the Collector, Service A, and Service B together
- Sending a test request: `curl -X POST http://localhost:8000/ask -d '{"question":"Find me a good restaurant"}'`
- What to look for in Galileo: one unified trace tree spanning both services
- Local dev workflow (Collector in Docker, services run natively for fast iteration)

---

## VII. What You See in Galileo
- The reconstructed trace: how Galileo assembles spans from two independent services into a single tree
- **Use the screenshot here** — the trace tree from a real end-to-end run
- Span hierarchy walkthrough: `POST /ask` (FastAPI) → `POST /ask http send` (httpx outbound) → `POST` (Express inbound) → `LangGraph` → `call_ts_service` → `format_response`
- Latency breakdown: total 1.09s, with `call_ts_service` at 1.07s — immediately shows where time is spent
- LangGraph span metadata: `langgraph_node`, `langgraph_path`, `langgraph_step`, `langgraph_triggers` — OTel carrying framework-level context, not just HTTP spans
- Input/Output visibility in the `format_response` span — the question in, the final formatted answer out
- Practical debugging scenarios this unlocks (e.g., "why is this agent call slow?", "what did the LLM actually receive?")



---

## VIII. Key Takeaways and Extensions
- Auto-instrumentation is your friend: minimal code, maximum coverage
- The OTel Collector pattern scales — add more services, more exporters, without changing app code
- Polyglot is not a barrier: W3C `traceparent` is language-agnostic
- **What to try next**:
  - Add a third service (Node.js, Go, etc.) and watch the trace tree grow
  - Swap the mock LLM for a real model and observe token-level spans
  - Add metrics and logs pipelines to the same Collector
  - Explore Galileo's evaluation features on top of the trace data

---

## IX. Conclusion
- Distributed tracing across polyglot AI services is achievable with surprisingly little boilerplate
- OpenTelemetry's auto-instrumentation + W3C propagation standards do the heavy lifting
- The OTel Collector is the right abstraction layer between your apps and your observability backend
- Link to repo for readers to clone and run themselves
https://github.com/KazChe/distributed-tracing-otelcollector-galileo

---
*All opinions are my own
*Target audience: backend/platform engineers building multi-service AI apps; ~1,500–2,500 words*
*Companion assets: architecture diagram, annotated config snippets, Galileo screenshot*