---
title: "The LLM is just an unreliable third-party REST API - Part I"
datePublished: 2026-06-02T23:24:00.000Z
slug: llm-is-just-an-unreliable-third-party-api
cover: https://dhbtuus86mod.cloudfront.net/llm-unreliable-api.jpg 
---

I've been trying to get a mental model of agentic AI applications into something that I'm familiar with when thinking about building an application. The first thing that came to mind was web applications. You have your front end, you have your service layer, you have your data store on a high level. The following is an example of building a very crude, very simple CLI that given an array of reported issues or bugs will use an AI agent to go through a discriminated union and classify them in different buckets. 

While I was thinking about this, obviously one of the major players in any agentic application is the large language model. And in past projects, I'm sure as it is right now for so many of you, one of the unpredictable and unreliable pieces were third party APIs, therefore, it is not too much of a stretch to say:

**The LLM is just an unreliable third-party REST API**

That's the one-sentence mental hook. Every LLM-specific design decision collapses into something a backend programmer has already done, talking to Stripe, Twilio, a flaky internal microservice.

So, treat the LLM like a third-party API you don't trust and your architecture writes itself.

Here's what running the CLI on [four representative bug reports](https://github.com/KazChe/bug-cli-ai-agent/blob/main/tests/fixtures/example-input.json) actually produces, one input per classification bucket (full output in the repo at [sample-cli-run.json](https://github.com/KazChe/bug-cli-ai-agent/blob/main/sample-cli-run.json)):

```json
[
  {
    "classification": "actionable_ticket",
    "report_id": "report-0",
    "original_input": "Deleted a project this morning. Now if I paste the old URL into Chrome it still loads our app shell...",
    "title": "Deleted project URL loads app shell with no navigation back to Projects",
    "severity": "medium",
    "category": "project_lifecycle",
    "extraction_confidence": "high",
    "expected_behavior": "Navigating to a deleted project's URL should either redirect the user to the Projects list...",
    "observed_behavior": "The app shell loads on the deleted project URL. The left sidebar shows 'No chats yet'...",
    "steps_to_reproduce": [
      "Create a project and note its URL.",
      "Delete the project via the normal project deletion flow.",
      "..."
    ],
    "engineering_notes": "The 404 error state is being rendered correctly at the data/API level, but the UI route handler...",
    "missing_information": ["Browser version / OS", "..."]
  },
  {
    "classification": "partial_ticket_needs_clarification",
    "report_id": "report-1",
    "original_input": "Contract review gave me a totally wrong answer about the indemnity clause...",
    "title": "AI incorrectly reports unlimited liability when contract clearly caps it at $1M",
    "severity": "high",
    "category": "ai_response",
    "...": "(all actionable_ticket fields, plus:)",
    "clarifying_questions": [
      "Could you share the PDF (or a sanitized version)?",
      "What was the exact question you typed to the AI?",
      "..."
    ],
    "what_unlocks_actionable": [
      "Providing the source PDF or the verbatim indemnity clause text...",
      "..."
    ]
  },
  {
    "classification": "too_vague_request_more_info",
    "report_id": "report-2",
    "original_input": "upload is broken",
    "interpretation": "The user reports that 'upload is broken' but provides no additional context...",
    "clarifying_questions": [
      "What type of file were you trying to upload?",
      "What exactly happens when the upload fails?",
      "..."
    ],
    "suspected_category": "upload"
  },
  {
    "classification": "non_bug_support_question",
    "report_id": "report-3",
    "original_input": "How do I export my project to Word?",
    "suggested_route": "feature_request",
    "suggested_response": "Thanks for reaching out! What you're describing isn't a bug report, but rather a question about available functionality...",
    "reasoning": "The user is asking how to perform an action and notes they can only see PDF in the menu..."
  }
]
```

## Layer-by-layer mapping

 The code lives at [github.com/KazChe/bug-cli-ai-agent](https://github.com/KazChe/bug-cli-ai-agent)

| Our layer | Web-app equivalent | What both do | Why the analogy holds |
|---|---|---|---|
| `src/index.ts` (entry) | Express/Fastify route handler | Parses the incoming request, returns a response | Same job, different transport (stdin vs HTTP). Could swap to an HTTP handler tomorrow with zero changes to anything below. |
| `src/cli/runner.ts` (orchestration) | Controller / use-case orchestrator | Validates input shape, calls the service per item with bounded concurrency, builds the response | This is literally a controller. Your `runCli` is your route handler's body. |
| `src/classifier/classify.ts` (domain) | Service / business logic | Encapsulates the "what we actually do" | This is the only layer that knows the business rule ("classify bug reports"). Could ship as a library. |
| `src/llm/*` (LLM boundary) | Repository / external API client (think: Stripe SDK wrapper) | Talks to the third party, returns typed responses | `AnthropicClient` is the repository pattern, full stop. Interface for testability, real impl for runtime. |
| `src/schema/*` (contract) | DTOs / domain model / OpenAPI types | The shape the system agrees on, with every layer built around it | Same role: the single source of truth that downstream code consumes and upstream code produces. |

## Where the analogy buys us specific insights

Each of these is a "you already do this with web APIs" reframe of an LLM-specific design move. Gold for the blog:

| LLM design move | Same move with a REST API |
|---|---|
| Define a tool with `input_schema`, force `tool_choice` | Define an OpenAPI spec; the client must POST to the exact endpoint with the exact body |
| `LLMOutputSchema.safeParse(tool_use.input)`, validate the response | `responseSchema.parse(await fetch(...))`, never trust the response wire format. Zod here, class-validator/Pydantic/Joi there. |
| `.strict()` rejecting unknown keys | DTOs that fail on extra fields, defense against silent API additions |
| Double validation (LLM output → merge → final) | Validate the API response, attach server-owned fields (e.g. user ID from session), validate the merged object before persisting |
| Mock the `AnthropicClient` in tests | Mock the Stripe SDK in tests, exactly the same pattern |
| Inline error envelopes in the output array | A REST response with `[ { ok: true, data }, { ok: false, error } ]`, partial success isn't an error |
| Prompt caching | HTTP caching, same idea, different layer |
| The eval script | Synthetic monitoring (Datadog synthetics, k6), proves the third party still behaves |

That last row is the framing that lands hardest: **the live eval isn't a test, it's monitoring of a vendor.**

But as everything, not all mental models are one-to-one. There are places that this thing breaks, and the following is what's new with building with LLMs...not an exhaustive list, so please don't cancel me. That's Part II.


- Non-determinism. Stripe with the same input → same output. LLM → not. That's why the eval has an agreement threshold, not an equality assertion.

- The schema is what you hope for, not what's guaranteed. Stripe's OpenAPI is contractually enforced; Anthropic's tool input_schema is a strong suggestion the model usually follows. That's why strict post-call validation is the actual second line of defense, not the first.

- Cost scales with request body, not just request count. Caching the system prompt isn't a parity move with HTTP caching; it's a token economics move that has no clean web-API analog.

- Failures are about meaning, not transport. A 500 from Stripe means "couldn't process." A weird answer from an LLM means "processed it and produced nonsense." That's why your ClassifyError has stages (llm_schema, no_tool_use, final_schema) instead of just HTTP-style status codes.


[Part II](https://untounium.dev/posts/where-the-llm-as-rest-api-analogy-breaks-down) goes deep on each of the four, with code and an eval run.

Code lives at [github.com/KazChe/bug-cli-ai-agent](https://github.com/KazChe/bug-cli-ai-agent).


