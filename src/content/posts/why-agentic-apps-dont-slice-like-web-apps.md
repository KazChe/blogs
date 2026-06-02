---
title: "Why agentic apps don't slice like web apps"
datePublished: 2026-05-29T24:23:00.000Z
slug: why-agentic-apps-dont-slice-like-web-apps
cover: https://dhbtuus86mod.cloudfront.net/agentic-vs-web-apps.jpg
---

Why is this even hard to slice? Web app architecture rests on assumptions that agentic apps break on contact: durable state in a database, deterministic control flow in your runtime, loud failures, free function calls, and one testing discipline that covers everything. Strip those out and the layer boundaries move. Here is where they moved in this build.

1. State lives in the model, so the contract layer is the closest analogue to a data layer.
There is no database in this app, and that changes what "state" even means. In a Rails app state is rows in Postgres — durable, queryable, owned by your code. Here state is the model's internal disposition: prior tokens, the decision-order block it's pattern-matching against, the way "less than 10 meaningful words" gets weighed. None of that lives in my repo. The only state I own is what flows in and out — stdin text in, a four-variant discriminated union out. So the contract layer becomes the data layer by default; it's the only place I can pin invariants. ParsedReportSchema is my schema.rb.

classify.ts validates twice against schema.ts — LLMOutputSchema on toolUse.input, then ParsedReportSchema.safeParse after I merge report_id and original_input. Those two fields are the only state my code owns. Everything else — severity, category, steps_to_reproduce, the bucket itself — is produced inside the model and only exists once it crosses the schema boundary.
Half the control flow is written in English, which means the prompt is partially executable and prompt.ts and classify.ts are two halves of the same workflow.

2. Half the control flow in this app is written in English and runs inside the model. The decision-order block in prompt.ts is not documentation, it is an if-else ladder the model executes at inference. It is code — written in English and run by a transformer instead of V8. Three things follow. prompt.ts and classify.ts have to live next to each other because classify.ts is the call site and prompt.ts is the body; putting prompts in a separate config dir would be like putting your sort comparator in YAML. Prompt edits need code review. And prose changes need regression tests — the 20-message eval corpus is the test suite for the English half of the codebase.

The "CRITICAL: field discipline by classification" section of prompt.ts moved eval agreement from 0/20 to 17/20. One prose edit, the impact of a logic refactor. Meanwhile classify.ts forces tool_choice, so that English decision tree is the only branching logic deciding which of the four schema variants gets populated.

3. Determinism is engineered, not inherited.
Same input, same model, different output — non-determinism is the ground state of an agentic app. Web apps inherit determinism from the runtime; here I treat it as a stack of defenses. Forced tool_choice so the model literally cannot return prose. A tool input_schema generated from the same Zod source as the post-call validator, so the model is constrained at inference and re-checked after. Double validation — LLMOutputSchema first, ParsedReportSchema after merging runner-owned fields. Strict variants that reject unknown keys. And the eval as the only honest measurement of what leaked through. One gap I'd close for production: I never set temperature explicitly.

tool-schema.ts emits both the JSON schema sent to the model and the LLMOutputSchema that validates the response — one Zod source applied twice. Even with all that, the eval still shows 3/20 disagreements. The stack reduces non-determinism; it does not eliminate it.

4. Hallucination is a structural failure class, not a prompt problem.
Web apps fail loud — 500, exception, null pointer. Agentic apps fail quiet: confident, well-formed, completely wrong. So the architecture has to catch wrongness structurally. Defense in depth across three layers. The prompt has an explicit anti-hallucination rule — never invent steps_to_reproduce, expected_behavior, or observed_behavior. The schema is .strict() on every variant, so an invented suggested_route on an actionable_ticket throws a typed ClassifyError instead of silently shipping. The eval runs 20 messy inputs against the real model because a mocked SDK can't catch a regression in model behavior.

ClassifyError carries a typed stage — 'llm_schema' vs 'final_schema' — so when the model drifts in production you know exactly which boundary it crossed.
The implication if you're designing one of these for the first time: move your invariants out of the runtime and into the contract, because in an agentic app the schema is the only thing you fully own.

