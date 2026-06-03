---
title: "The LLM is just an unreliable third-party REST API - Part II"
datePublished: 2026-06-03T00:20:00.000Z
slug: where-the-llm-as-rest-api-analogy-breaks-down
cover: https://dhbtuus86mod.cloudfront.net/llm-unreliable-api-dark.jpg
---

In [Part I](https://untounium.dev/posts/llm-is-just-an-unreliable-third-party-api), I argued that if you treat the LLM like an unreliable third-party REST API, your architecture mostly writes itself. That frame holds up surprisingly well, but it isn't the whole story. This post is about the four places where it stops fully explaining what's happening, plus the one product insight the frame never predicts.

## 1. The response is non-deterministic

Part I flagged this; here's what it forces in code. The eval doesn't assert equality - it asserts an agreement _floor_ (default 70%) in `scripts/eval.ts`. Snapshot tests can't pin an LLM the way they pin a REST response, because the same input won't return the same bytes twice. So you measure distributions, not equality.

## 2. The schema is what you hope for, not what's guaranteed

Stripe's OpenAPI spec is enforced server-side by Stripe; you literally cannot get back a shape it doesn't allow. Anthropic's tool `input_schema` is different - I hand the model a schema defining the four output shapes, but it treats that as a strong suggestion, not a contract it's bound to. So after the call, `LLMOutputSchema.safeParse()` with `.strict()` rejects anything off-shape. The schema is the durable defense; the prompt is a polite request.

## 3. Cost scales with the request body, not the request count

REST APIs charge per call, or they're free. LLMs charge per token, which makes the request _body_ the cost driver, not the request count. That's why `src/llm/prompt.ts` marks the system block with `cache_control: 'ephemeral'`. One cached system prompt plus N uncached user messages is a fundamentally different shape from "the endpoint response was cached" - it's a token-economics move with no clean web-API analog.

## 4. Failures are about meaning, not transport

A 500 from Stripe means "we couldn't process it." A weird answer from an LLM means "we processed it and produced nonsense" - the transport succeeded, the meaning failed. That's why `src/classifier/classify.ts` has a `ClassifyError` class with a typed `stage` field: `'no_tool_use' | 'wrong_tool_name' | 'llm_schema' | 'final_schema'`. HTTP status codes describe transport failures; these stages describe _where in the pipeline meaning broke down_. Richer failure modes need richer error vocabulary.

## The product insight the frame doesn't predict: refuse to draft

The third-party-API frame says "validate the response and move on." It doesn't say "let the service refuse to answer cleanly." But that turned out to be the core product call in this build: not every input should become a ticket. The four buckets - `actionable_ticket`, `partial_ticket_needs_clarification`, `too_vague_request_more_info`, `non_bug_support_question` - let the LLM explicitly refuse to draft when the input is too thin. That refusal is a first-class output, not an error state. No REST analogy predicts it, because a REST endpoint doesn't get to decide your request wasn't worth answering.

## The code that ties it together: double validation

```ts
// src/classifier/classify.ts (excerpt)

const toolUse = response.content.find((b) => b.type === "tool_use");
if (!toolUse) {
  throw new ClassifyError("no tool_use block", response, "no_tool_use");
}

// Validation pass 1: did the model give us a valid response shape?
const llmParsed = LLMOutputSchema.safeParse(toolUse.input);
if (!llmParsed.success) {
  throw new ClassifyError("LLM drift", llmParsed.error, "llm_schema");
}

// Merge in the fields the runner owns; the model never sees these.
const merged = {
  ...llmParsed.data,
  report_id: reportId,
  original_input: rawInput,
};

// Validation pass 2: does the merged result satisfy the full contract?
const final = ParsedReportSchema.safeParse(merged);
if (!final.success) {
  throw new ClassifyError("contract violation", final.error, "final_schema");
}

return final.data;
```

Pass one catches the model when it drifts (stretch point #2); pass two guarantees the contract downstream consumers depend on, even if my own merge step is wrong. Two `safeParse` calls, two safety nets, one durable contract.

## Receipts: what the eval said

![bun run eval over the 20-entry messy corpus: 17/20 agreement on claude-sonnet-4-6, with three class-boundary misses (a-05, v-04, n-05)](https://dhbtuus86mod.cloudfront.net/run-evals.png)

17 out of 20 agreement on the [messy 20-entry corpus](https://github.com/KazChe/bug-cli-ai-agent/blob/main/tests/fixtures/raw-inputs.ts), scored against the expected labels I'd written by hand. The three misses were all class-boundary judgment calls: was the Okta SAML outage `actionable` or `partial`? Did the raw React stack trace count as `too_vague` or `partial`? On at least two of them, I think the model was actually right and my label was wrong. That's the point - the number isn't the deliverable. The eval gives you something concrete to _disagree with the model about_, which is exactly what monitoring a third-party vendor should do.

## Closing

These four stretch points are why LLM systems aren't just REST clients with extra steps. But notice that none of them break the frame - they bend it. Once you stop treating non-determinism, schema-as-hope, token economics, and meaning-failures as problems to eliminate and start treating them as constraints to design around, the architecture stops feeling weird and starts feeling inevitable. The code lives at [github.com/KazChe/bug-cli-ai-agent](https://github.com/KazChe/bug-cli-ai-agent).
