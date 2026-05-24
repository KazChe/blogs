---
title: "A fragmented instrument for Gen AI Observability"
datePublished: 2026-05-24T12:00:00.000Z
slug: a-fragmented-instrument-for-genai-observability
cover: https://dhbtuus86mod.cloudfront.net/otel-genai-fragmentation-v2.jpg
---

## Why I wrote this

I've been testing OpenTelemetry propagation across seven agent frameworks AutoGen, CrewAI, LangGraph, Haystack, PydanticAI, LlamaIndex, and Google ADK to figure out whether the current GenAI semantic conventions are enough to make agentic traces actually useful. The short answer is: not yet, and the gap is not because any single framework got something wrong. It is because the standards layer, the instrumentation layer, and the platform layer are each fragmenting in their own direction at the same time, and the fronts compound.

I want to lay this out because I keep seeing the same problem framed in narrower terms than it deserves: "framework X doesn't propagate context," "library Y emits weird spans," "vendor Z's agent view looks nothing like vendor W's." Those are all real, but they are symptoms of the same underlying gap. The semantic-convention layer has not yet standardized the two signals every downstream consumer needs in order to render an agentic trace the same way: which spans belong to the same logical unit, and which LLM decision triggered which tool call. Without those, every consumer downstream of the wire format has to invent its own answer, and the answers diverge.

The rest of this doc lays out the three fronts of fragmentation I keep running into, and the slice of the upstream fix this repo is actually proposing. The proposals themselves live in [ISSUE_GROUPING.md](https://github.com/KazChe/otel-genai-semconv-grouping-causality-prototype/blob/main/ISSUE_GROUPING.md) and [ISSUE_CAUSALITY.md](https://github.com/KazChe/otel-genai-semconv-grouping-causality-prototype/blob/main/ISSUE_CAUSALITY.md); the cross-runtime evidence lives in the [frameworks/](https://github.com/KazChe/otel-genai-semconv-grouping-causality-prototype/tree/main/frameworks) directory.

## The landscape: three fronts of OTel GenAI fragmentation

OpenTelemetry's GenAI semantic conventions are being adopted into an ecosystem that is fragmenting on three fronts at once, and the fronts compound each other.

OpenTelemetry's GenAI semantic conventions are being adopted into an ecosystem that is fragmenting on three fronts at once, and the fronts compound each other.

**Front 1 - Agent runtimes.**

Each agent runtime emits its own GenAI telemetry shape and carries its own internal context-propagation model. AutoGen, CrewAI, LangGraph, Haystack, PydanticAI, LlamaIndex, and Google ADK each make different choices about what counts as an inference span vs a tool span, which boundaries (sync, async, thread, subprocess, event-loop hop, framework-managed worker) preserve OTel context, and whether tool-call payloads pass through validation layers that silently strip unknown fields. The targeted tests in `frameworks/*/` in this repo were necessary because assumptions that hold in one runtime routinely fail in another.

**Front 2 - Instrumentation libraries.**

Even where the underlying runtime is consistent, the instrumentation libraries that wrap it adopt OTel GenAI semconv unevenly. A `chat` span produced by one library and an `execute_tool` span produced by another may not share a parent, may not share a context, and may not even agree on which attributes belong on which span. The cross-library cases documented in [ISSUE_CAUSALITY.md](https://github.com/KazChe/otel-genai-semconv-grouping-causality-prototype/blob/main/ISSUE_CAUSALITY.md), where `inference` and `tool` spans are emitted by independent libraries whose lifecycles do not overlap, are a direct symptom of this front.

**Front 3 - Observability platforms.**

Each platform ingesting GenAI telemetry currently has to normalize, infer, or reconstruct signals that the producers did not standardize: which spans belong to the same iteration, which LLM decision triggered which tool call, what an "agent" actually is across runtimes. The result is proprietary, per-vendor agentic views built on top of inconsistent inputs, which then re-fragments the user experience downstream of the wire format.

## What this repo tackles

This repo does not attempt to fix all three fronts. It addresses a defined slice at the semconv layer, the upstream point where reducing fragmentation is cheapest, by proposing standardized intent for two specific gaps that affect every front above: **grouping** ("which spans belong to the same logical unit?") and **causality** ("which LLM decision triggered which tool execution?"). Both proposals are deliberately scoped to standardize semantic intent and interoperability guidance, not framework-internal plumbing, following the precedent pattern documented in [otel-semconv-precedents.md](https://github.com/KazChe/otel-genai-semconv-grouping-causality-prototype/blob/main/otel-semconv-precedents.md). The framework directories provide the cross-runtime evidence base, what propagates and what does not, so the proposals are anchored in observed behavior across the fragmented runtime layer rather than in any single framework's model.
