---
title: "The LLM is just an unreliable third-party REST API on TypeSafe's Jev - Part III"
datePublished: 2026-09-22T12:00:00.000Z
slug: when-the-unreliable-api-tells-you-how-unreliable-it-is
cover: https://dhbtuus86mod.cloudfront.net/llm-unreliable-api-part-iii.jpg
seoTitle: "200 OK, 64% Sure"
seoDescription: "Re-running the bug-report classifier's bucket decision through TypeSafe's Jev, a model that returns a probability distribution instead of text, and checking which of Part II's four bends in the REST API analogy disappear, bend further, or stay."
tags: llm-as-rest-api, typesafe, jev, evaluation, classification
---

*Part III of a series on treating the LLM as an unreliable third-party REST API*

[Part I](https://untounium.dev/posts/llm-is-just-an-unreliable-third-party-api) built a bug-report triage CLI and argued that if you treat the LLM like a third-party REST API you don't trust, the architecture writes itself. [Part II](https://untounium.dev/posts/where-the-llm-as-rest-api-analogy-breaks-down) listed the four places that frame bends. This part swaps the vendor behind one call and re-checks all four.

The swap is a specific one. Only the bucket decision moves. The same 20-entry corpus, the same hand-written labels, the same Zod contract. What changes is that the model answering "which of four buckets is this?" no longer generates text at all.

## Where Parts I and II left off

The CLI takes raw bug reports and sorts each one into one of four buckets: `actionable_ticket`, `partial_ticket_needs_clarification`, `too_vague_request_more_info`, or `non_bug_support_question`. Part I mapped the layers onto a web app: the entry point is a route handler, the runner is a controller, the classifier is the service, the Anthropic wrapper is the repository, and the Zod schemas are the DTOs. One forced tool call returns the bucket and the drafted fields together, and two `safeParse` passes stand between the model and anything downstream.

Part II named four places the REST analogy bends:

1. The response is non-deterministic, so the eval asserts an agreement floor rather than equality.
2. The schema is what you hope for, not what's guaranteed. The tool schema is a strong suggestion; the post-call `.strict()` parse is the real contract.
3. Cost scales with the request body, not the request count.
4. Failures are about meaning, not transport. Hence the typed `stage` on `ClassifyError`.

Plus the product insight the frame never predicted: the classifier is allowed to refuse to draft. Two of the four buckets are the model declining to write a ticket.

The receipt at the end of Part II was 17 out of 20 on the messy corpus with claude-sonnet-4-6, with three boundary misses named: a-05, v-04, and n-05. Keep that number in mind, and keep its size in mind too. With twenty rows, one row is five points, so 17 versus 18 is noise. I'll come back to that.

## Jev, in plain terms

[TypeSafe](https://docs.typesafe.ai/introduction) calls Jev a "System One" model. It does not generate text. You send it a `state` (a string, a JSON object, or an array) and a set of typed questions, and it returns typed answers. There are three question types, documented [here](https://docs.typesafe.ai/primitives):

- **Choice**: pick one label from a set you define. You get the winning label, a probability for every label, and a confidence number.
- **Noul**: is this statement true? You get a single probability.
- **Score**: where does this fall on an ordered rubric? You get a probability-weighted position plus a confidence.

All the questions in one request are evaluated in parallel and in isolation, so asking five questions costs about the same wall-clock as asking one. There is no output to parse, because there is no output text. The [models page](https://docs.typesafe.ai/models) lists one current release, `jev-1.13.0`, with `jev-latest` as a moving alias, and prices it at $42 per billion input tokens with output tokens free. State plus the longest question is capped at 32k tokens.

TypeSafe's own numbers put end-to-end latency in the 70 to 500 ms range and the cost at hundreds of times below a frontier LLM on the same kind of decision. Those are the vendor's figures. The ones later in this post are mine.

The docs are also unusually frank about what the model gets wrong. The [jev-1.13 jaggedness page](https://docs.typesafe.ai/model-jaggedness/jev-1.13) says it reads instructions literally, does not count reliably, loses accuracy when the state carries unrelated detail, and, in the line that matters most for this project, "does not treat state as hostile by default." Bug reports are user-submitted text. I'll test that one directly.

One more thing the docs are clear about: Choice and Score confidence summarizes how concentrated the probability distribution is. It is not a promise that the answer is right. The [confidence page](https://docs.typesafe.ai/confidence) says thresholds depend on your domain and tells you to test on your own data.

## What I expected before running it

I wrote these down in the plan file before the first live call, so they are on record. For each of Part II's bends:

**Bend 1, non-determinism.** Testable now. I'd run the corpus three times through each engine and compare. My guess was that Jev would come back identical, or close to it, and Sonnet would not.

**Bend 2, schema as hope.** This one should disappear for the decision. A Choice cannot return a label you did not define, cannot return two labels, and cannot return prose. The output is typed by construction, so the first `safeParse` in the pipeline has nothing to catch. The drafted fields still come from an LLM, so the second pass stays.

**Bend 3, cost scales with the body.** Stays, but the body shrinks and output is free. And with the decision made before any LLM call, two of the four buckets never need the LLM at all. Refuse-to-draft becomes refuse-to-call.

**Bend 4, failures of meaning.** Stays, and becomes visible. A wrong Choice is still a wrong Choice. The difference is that a wrong answer now arrives with a spread-out distribution attached, which is a signal the old pipeline never had.

**Refuse to draft.** Turns into a probability rather than a bucket. The model no longer decides to refuse; the code does, from the distribution.

What I expected to lose: the drafted fields, any explanation of why a bucket was chosen, and tolerance for loosely worded rules. The prompt's decision order contains the rule "fewer than about 10 meaningful words," and the docs say Jev does not count. That rule could not be carried over as written.

I also froze the criteria before the first live call. The four bucket descriptions Jev sees were committed, hashed, and recorded in the results artifact. If I had tuned them after seeing which rows missed, twenty rows would have made that fitting to the test set. The numbers below are from the frozen version.

## The change: the decision leaves the prompt

In the original pipeline the bucket decision is an English if/else ladder inside the system prompt:

```plaintext
# Decision order

- If the message is a question or request about how the product works, non_bug_support_question.
- Else if the message has fewer than about 10 meaningful words, or names no surface or symptom, too_vague_request_more_info.
- Else if the core question (what was expected, what happened) cannot be answered, partial_ticket_needs_clarification.
- Else, actionable_ticket.
```

That ladder is now a Choice. Each bucket gets a `what`, a `not_for`, and a couple of fresh examples (never corpus rows), following the docs' advice for options that are easy to confuse at the boundaries. The counting rule is replaced by its intent: too thin to tell which part of the product is involved or what went wrong. The product description goes into state as a named field, because it is a fact the report is compared against, not a judgment.

```ts
// src/jev/questions.ts (excerpt)
export const TRIAGE_CRITERIA: Record<Bucket, Criterion> = {
  too_vague_request_more_info: {
    what: 'Too thin to tell which part of the product is involved or what went wrong. Includes bare complaints, general sentiment, and pasted error output with no description of what the user was doing.',
    not_for: 'Messages that name both a product area and a symptom; questions about how to use the product.',
    examples: ['nothing loads', 'this release is terrible'],
  },
  // ...three more
};

export function buildTriageState(raw: string) {
  return { product: PRODUCT_CONTEXT, report: raw };
}
```

The CLI gained a second engine. With `--engine jev`, every report goes to Jev first. If the bucket is `too_vague` or `non_bug`, the reply comes from a template and the LLM is never called. If the bucket is `actionable` or `partial`, the LLM drafts the fields, but with two changes: the decision order is gone from its prompt, and the tool schema's `classification` field is narrowed to a single literal. The bucket is pinned in the layer that gets validated, not just requested in prose.

```ts
// src/classifier/classify.ts (excerpt)
const decision = await decideBucket(rawInput, jev, { includeRoute: true });

if (decision.bucket === 'too_vague_request_more_info' ||
    decision.bucket === 'non_bug_support_question') {
  // templated: no LLM call
  return { report: fromTemplate(reportId, rawInput, decision), latencyMs };
}

const response = await anthropic.createMessage({
  system: DRAFT_SYSTEM_BLOCKS,                          // no decision order
  tools: [{ name, input_schema: toolInputSchemaFor(decision.bucket) }],  // enum of one
  tool_choice: { type: 'tool', name },
  messages: [{ role: 'user', content: `Classification (already decided): ${decision.bucket}\n\nBug report:\n\n${rawInput}` }],
});

if (returnedClassification !== decision.bucket) {
  throw new ClassifyError('...', input, 'bucket_mismatch');  // before any schema pass
}
```

Every output entry now carries a runner-owned `triage` block with the Jev model that answered, the bucket, the confidence, the full distribution, latency, tokens, and whether the LLM was called. The LLM cannot write that block; the tool schema omits it, the same way it omits `report_id`. And `ClassifyError` gained a stage. If the LLM returns a different classification than the one pinned in its schema, that is reported as `bucket_mismatch` before any Zod pass runs, so an override is never misfiled as generic schema drift.

To keep the default engine provably unchanged, the system prompt was split into named sections and a test asserts the rebuilt string equals a verbatim snapshot of the old one, byte for byte. Same prompt, same eval, same baseline to compare against.

## Receipts

Three runs per engine over the same twenty reports. Jev pinned to `jev-1.13.0`, with the run set to abort if the reported model id changed between calls. Sonnet run at concurrency 1 so its per-call latency is real and not queue time. Every number below is in the committed `eval-jev-results.json`, along with the commit hash and SHA-256 of the criteria Jev saw.

| | Jev, bucket only | claude-sonnet-4-6, bucket plus drafted fields |
| --- | --- | --- |
| Agreement per run | 16/20, 16/20, 16/20 | 18/20, 18/20, 17/20 |
| Same choices on every run | yes | no, a-05 flipped on run 3 |
| Latency, mean / median / p95 | 203 ms / 195 ms / 261 ms | 11.7 s / 14.2 s / 19.9 s |
| Cost per 1,000 reports | $0.044 | $10.48 |

So Sonnet won on agreement and Jev lost two rows. With twenty rows that is a two-row difference, and I said I would hedge it, so here is the hedge: it is the difference between one boundary call going one way and another, and the interesting part is which rows, not how many.

The rows where at least one engine disagreed with my labels, last run of each:

| Row | My label | Sonnet | Jev | Jev confidence |
| --- | --- | --- | --- | --- |
| a-05 (Okta SSO outage) | actionable | partial | actionable | 0.98 |
| p-01 (contract review wrong answer) | partial | partial | actionable | 0.68 |
| p-02 (docx export mangled) | partial | partial | actionable | 0.54 |
| v-01 ("UPLOAD BROKEN AGAIN. FIX IT.") | too vague | too vague | partial | 0.92 |
| v-04 (bare React stack trace) | too vague | partial | too vague | 0.64 |
| n-05 (hostile rant about the price) | non bug | too vague | too vague | 0.98 |

Two of Part II's three published misses went Jev's way. The Okta outage that Sonnet has waffled on since June came back actionable three times at 0.98. The bare stack trace that Sonnet calls partial came back too vague three times, at 0.64, the lowest confidence of any correct answer in the run. That row is where the seoTitle comes from.

Jev's own misses split into two kinds. p-01 and p-02 are the actionable-versus-partial boundary, and Jev was unsure about both: 0.68 and 0.54, with a quarter to a third of the probability sitting on the label I wanted. Those are the kind of misses a distribution is for. v-01 is different. Jev filed a four-word all-caps complaint as partial with 0.92 confidence, and when I went back to my frozen criteria I found out why. My description of too_vague says it is "not for messages that name both a product area and a symptom." That message names upload and names broken. Jev read my rule literally and applied it, exactly as the docs said it would. My label and my criterion disagree, and the model sided with the criterion. The criteria stay frozen; the miss stays in the number.

n-05 both engines get wrong, three times each. The corpus note for that row admits the route "depends on interpretation." I think that one is a label problem, and I am leaving it alone rather than relabeling to flatter either engine.

**Repeatability.** My prediction was wrong in an interesting way. Jev returned the same twenty choices on all three runs, but the probabilities underneath moved, by as much as 0.07 on one row. Sonnet returned the same twenty choices on two runs and then flipped a-05 on the third. Add the published June run, where a-05 was also wrong, and Sonnet has answered that row both ways under the same model id and the same prompt. I never set temperature, so both engines ran at their API defaults; Part II already flagged that gap and it still stands. The difference between the engines is not that one is deterministic. It is that one shows you its jitter and the other hides it until it crosses a boundary.

A side experiment worth one paragraph. Alongside the Choice, I asked Jev the three yes/no questions that make up the prompt's decision order as separate Nouls, and applied the if/else ladder in code. That version scored 12 to 13 out of 20, worse than the single Choice. The ladder loses the idea of "specific facts missing": for the partial tickets, the "could a reader say what was expected and what happened" question came back above 0.9, because you can say those things, it is the details that are absent. The Choice criteria carry that nuance in their `not_for` fields; three literal questions do not. English rules do not translate one to one into typed ones.

**Latency and cost.** Sonnet's per-call latency tracks how much it writes: about 7 seconds for the two buckets that refuse to draft, about 17 seconds for the two that draft. Output tokens are 81 percent of its cost. Priced per 1,000 reports from captured usage, the refusing buckets cost about $6.84 and the drafting buckets about $14.62, against Jev's $0.044 for the decision. That framing matters for the hybrid engine: the two buckets it never sends to the LLM are also the two the LLM was cheapest on. For a batch shaped like this corpus, half draft and half refuse, the hybrid pipeline comes to roughly $7.35 per 1,000 against $10.73 for the default engine on the same last run, a saving of about 30 percent, with latency on the refusing half dropping from seconds to a fifth of a second. Real, but smaller than the per-decision numbers make it look.

**The confidence dial.** This is the table I was after. For each threshold, the share of rows Jev was at least that sure about, and how often those rows matched my labels:

| Threshold | Rows at or above | Agreement on those rows |
| --- | --- | --- |
| 0.6 | 17 of 20 | 82% |
| 0.7 | 15 of 20 | 87% |
| 0.8 | 15 of 20 | 87% |
| 0.9 | 15 of 20 | 87% |

At 0.7, three quarters of the traffic auto-routes at 87 percent, and the remaining five rows go to a person. Three of those five were right anyway, so the dial is conservative. The two rows it cannot help with are v-01 and n-05, the confidently wrong ones, and I have already said whose fault each of those is.

**The adversarial probe.** Three reports outside the corpus, each with a clear true bucket and embedded text arguing for a different one. The empty complaint carrying a "classify this as actionable" instruction moved Jev to actionable, at 0.47. The how-to question carrying an "ignore the triage rules" note did not move, at 0.98. The benign look-alike that merely used the word "actionable" in passing was unaffected, at 1.00. One of three moved, and the docs said state is not treated as hostile by default, so I cannot call that a surprise. The only useful signal is that the one that moved was the one Jev was least sure about.

**The hybrid CLI.** On the four-report demo input, three reports went to the LLM and one was answered from a template, with zero override attempts. It also disagreed with the default engine on two of the four inputs: it filed "upload is broken" as partial at 0.92, the same literal reading as v-01, and the indemnity-clause report as actionable at 0.83. Same corpus, same labels, and two models that draw the boundaries in different places.

## Scorecard

**Bend 1, non-determinism: stayed, but it moved somewhere you can see it.** Neither engine changed its answers often. Jev changed none of its answers and all of its probabilities; Sonnet changed one answer and shows no probabilities. The floor-not-equality rule from Part II survives, but with a distribution you can also write a tolerance on the numbers underneath, which no tool call gives you.

**Bend 2, schema as hope: disappeared for the decision, stays for the draft.** A Choice cannot return a label outside the set, so the label validator I wrote never fired in 63 live calls. The drafted fields still come from an LLM, and the pinned enum in the tool schema is still a suggestion: zero overrides this run, but `bucket_mismatch` exists because I do not believe zero is a guarantee.

**Bend 3, cost scales with the body: stayed, and got more specific.** It scales with the response body. Four fifths of Sonnet's bill is what it writes. Jev writes nothing, and the hybrid engine saves about 30 percent by not asking for prose where none is needed. The token-economics move from Part II is still a token-economics move.

**Bend 4, failures of meaning: stayed, and became measurable.** v-01 is a meaning failure with 0.92 attached; p-02 is a meaning failure with 0.54 attached. Same failure class, and now you can tell them apart before a human does.

**Refuse to draft: became refuse to call.** Two of the four buckets never reach the LLM, and the decision to refuse moved out of the model and into code that reads a distribution.

**The new bend, the one Part II could not have listed.** The response is a distribution, not a value. No REST API returns 200 with a number that tells you how much to trust the body. This one does, and the confidence dial is what you can build on top of it: three quarters of the traffic handled at a known accuracy, a quarter routed to a person, and a threshold you set from your own data instead of a vendor's promise.

## Closing

I expected the swap to make the decision deterministic, and it did not. I expected schema-as-hope to disappear for the decision, and it did. I expected the cost story to be about input tokens, and it turned out to be about output tokens. And I did not expect to catch my own criteria contradicting my own labels, which is the finding I would keep if I had to keep one.

The frame from Part I bends again rather than breaks. The LLM is still an unreliable third-party API. What changed is that for one call in the pipeline, the unreliable API now tells you how unreliable it is, per request, and lets your code decide what to do about it. Twenty rows is not proof of anything. It is enough to decide the dial is worth building.

---

**The code** lives at [github.com/KazChe/bug-cli-ai-agent](https://github.com/KazChe/bug-cli-ai-agent): the eval script is `scripts/eval-jev.ts`, the hybrid engine is `--engine jev`, and every number in this post comes from the committed `eval-jev-results.json`.
