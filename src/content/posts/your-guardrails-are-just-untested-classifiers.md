---
title: "Your guardrails are just untested classifiers"
datePublished: 2026-06-26T12:00:00.000Z
cover: https://dhbtuus86mod.cloudfront.net/untested-classifiers.jpg
seoTitle: "Your guardrails are just untested classifiers"
seoDescription: "A guardrail that blocks or allows is a classifier, and nobody scores it. We put a real precision/recall number on a guardrail everyone deploys and no one measures, using Agent Control as the guardrail and Galileo as the grader."
tags: ai-guardrails, observability, evaluation, agentic, galileo
---

A guardrail that blocks or allows a request is a classifier. It takes some text in, and it puts out one bit: *safe* or *not safe*. That's the same job as a spam filter, a fraud model, or any other binary classifier you've ever shipped.

Here's the thing. You would never ship a fraud model without a precision and recall number. You'd be laughed out of the room. But we ship guardrails, the things standing between an agent and a PII leak, or between a user and a prompt injection, with **zero** measurement, and we call it "safety." We wire one up, watch it block something obvious in a demo, and ship it.

I want to put a real number on one.

## A guardrail is just a classifier

This is the same move I made with [the LLM being just an unreliable third-party REST API](https://untounium.dev/posts/llm-is-just-an-unreliable-third-party-api): take the scary new agentic thing and notice it's a boring old thing you already know how to reason about. A guardrail isn't special. It's a classifier with a [confusion matrix](https://en.wikipedia.org/wiki/Confusion_matrix), and a confusion matrix has four boxes:

- **True positives.** It caught the bad thing. Good.
- **False positives.** It blocked something fine. Your "safety" layer is now silently degrading the product, refusing legitimate traffic, and nobody is attributing the lost conversions to it.
- **False negatives.** It let the bad thing through. The leak you thought you'd stopped just walked out the door.
- **True negatives.** It correctly left good traffic alone.

If you can't fill in those four boxes for a guardrail you're running in production, you don't have a safety control. You have a vibe.

## The cast: one tool enforces, the other grades

To make this concrete I need a real guardrail, not a toy regex I wrote for a blog post, but the kind of thing people actually deploy. So I'm using [Agent Control](https://github.com/agentcontrol/agent-control), an open-source control plane for runtime agent guardrails.

And here's the detail that *is* the whole post: when you look at what Agent Control actually ships, the built-in evaluators are [`regex`, `list`, `json`, and `sql`](https://github.com/agentcontrol/agent-control). That's it. So your "PII guard" is, underneath, a **regular expression**. Your "prompt-injection guard" is a **regex or a list of banned phrases**. These aren't strawmen I'm inventing. They're the literal mechanism people put in front of production agents and call a guardrail.

Agent Control's job is to *enforce* that guardrail. At runtime it runs the evaluator, gets a `matched: bool` back, and blocks, steers, or observes. What it does **not** do, by design, and correctly, is tell you whether the evaluator is any good. There's no precision number anywhere in the system. A broken regex will run in production forever, blocking good traffic and leaking the bad, and the control plane will report nothing wrong, because from its point of view nothing *is* wrong. It enforced exactly what you told it to.

That's the gap. **Enforcement is not evaluation.** So we bring in a second tool whose entire job is evaluation: [Galileo](https://docs.galileo.ai). Agent Control runs the guardrail. Galileo grades it.

| Tool | Role |
| --- | --- |
| **Agent Control** | the guardrail under test, runs the evaluator, blocks or allows, but never grades itself |
| **Galileo** | the grader, scores that guardrail like the classifier it is |

This is the smaller, concrete proof of a claim I keep coming back to: a control plane needs an eval plane next to it. Enforcement without measurement is blind. Here is the control plane, running a guardrail it cannot grade, and here is the eval plane grading it.

## What we're actually going to do

The plan is deliberately small, because the point is that this *should* be small and nobody does it anyway.

1. **Build a labeled test set.** A couple hundred examples, hand-labeled, weighted toward the cases that break regexes:
   - real PII and real injections that *should* be caught,
   - benign look-alikes that should *not* be caught, like an order number that looks like an SSN, a phone number, or a sentence like "ignore the previous paragraph in my essay,"
   - and evasions that should still be caught, like a spelled-out SSN, weird spacing, or full-width digits.

   The whole result lives or dies on those middle two buckets. Easy inputs make every guardrail look great.

2. **Run each example through the Agent Control guardrail.** This is the part people assume is hard and isn't: the evaluators are a plain Python library. You import one, call `.evaluate()`, and read `matched`. No Docker, no Postgres, no server. The enforcement infrastructure only matters at runtime, not when you're scoring the thing offline. It's about twenty lines.

3. **Score it in Galileo.** Turn that test set into a dataset, run the guardrail's verdicts against the labels, and get precision, recall, and a false-positive rate, with the exact rows it got wrong so you can stare at them.

4. **Compare against Galileo's own detectors.** Galileo ships preset metrics for [PII](https://docs.galileo.ai/concepts/metrics/safety-and-compliance/pii) and [prompt injection](https://docs.galileo.ai/how-to-guides/luna/experiments-with-luna/experiments-with-luna), including small-model versions that run cheaply and LLM-judge versions that run deep. Same inputs, different graders, side by side.

## Where I expect this to land

I have a guess about the numbers, and the guess is the reason the post is worth writing:

- The cheap regex **over-blocks.** It fires on the benign look-alikes, posting a false-positive rate nobody ever measured. That's a product-quality tax disguised as safety.
- The cheap regex **under-catches.** It misses trivial evasions, so the leak it was built to stop gets through anyway.
- Galileo's smarter detectors catch what the regex misses, but they cost latency you can't spend on every live request.

Which lands exactly where the [two-clocks](https://untounium.dev/posts/why-agentic-apps-dont-slice-like-web-apps) argument said it would: a cheap deterministic guard at runtime, a smarter grader running offline on sampled traffic. Two layers, not one. Defense in depth, but argued with a confusion matrix instead of asserted with a slide.

If I'm wrong and the regex holds up, that's a publishable result too: the boring tool is better than you'd think. Either way, we end up with the one thing the guardrail never came with, a number.

The one-sentence version, the way I'd say it to someone in a hallway: **Agent Control runs your guardrail blind, Galileo grades it, and almost nobody bothers to look.**

Let's go build the test set.
