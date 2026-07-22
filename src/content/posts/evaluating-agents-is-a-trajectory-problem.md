---
title: "Evaluating an AI Agent Is a Trajectory Problem"
datePublished: 2026-07-22T12:00:00.000Z
slug: evaluating-agents-is-a-trajectory-problem
cover: https://dhbtuus86mod.cloudfront.net/trajectory-eval.png
---

*Part 1 of a series on evaluating agents with Galileo*

The default way we judge anything an AI produces is to ask one question: was the answer good? Did the summary capture the document, did the code compile, did the reply say something true. That instinct is fine, and for a lot of systems it's all you need. You have an input, you have an output, you grade the output.

It quietly falls apart the moment the thing you are grading is an agent.

## An agent doesn't hand you an answer. It takes a journey.

A chatbot gives you a response. An agent gives you a *sequence of decisions*. It reads your request, forms a plan, reaches for a tool, looks at what came back, decides that changed things, reaches for another tool, and keeps going until it thinks it's done. What you actually get at the end is the last step of a path, and the path is the interesting part.

That path has a name, and it isn't one I'm coining. **Trajectory** is the word the agent and reinforcement-learning world already uses for the whole ordered run of choices an agent makes to get from a prompt to a result, so that's what I'll use here too. Once you frame it that way, "was the answer good?" starts to feel like grading a road trip by looking only at the parking spot. The car ended up somewhere. Fine. But did it take a sensible route, or did it drive three hours the wrong way, double back, and stumble into the destination by luck? Same final position, very different journeys, and only one of them tells you whether to trust the driver next time.

Grading a trajectory is a genuinely different problem from grading an answer, for a few reasons that all compound:

- **The unit is a sequence, not a point.** A good final answer can sit on top of a wasteful, lucky, or dangerous path. A bad answer can sit on top of mostly-correct reasoning that tripped at the last step. If you only score the endpoint, you can't tell those apart, and they need completely different fixes.
- **Each step only makes sense in context.** A single decision in the middle of a conversation is often uninterpretable on its own. "Yes, do that." "Option A." "Number one." Half of what gets said to an agent is a pointer to something earlier. Rip one step out of its trajectory and you can't even tell whether it was reasonable, let alone grade it.
- **The failures you care about are between the steps.** The agent that reaches for a web search when the answer was sitting in the repo, or keeps re-reading the same file, or quietly picks the wrong tool and then builds three more steps on top of it: none of that shows up in the final answer. It shows up in the shape of the path.

So evaluating an agent means evaluating a trajectory, in context, as one connected thing. Which puts a very specific demand on whatever platform you use to do it.

## Most tooling grades the wrong thing (or nothing)

Point observability at an agent today and the usual thing you get is a usage dashboard: tokens, cost, latency, how many times each tool fired, sessions per day. That's real information and I don't want to knock it. But it's operational accounting. It tells you *how much* the agent did, never *whether the doing was any good*. You can watch an agent make terrible decisions very efficiently, and a cost dashboard will show you a clean, cheap, green wall the whole time.

The thing that's usually missing is the ability to treat a whole multi-turn conversation as a single, first-class object you can reason about and score, with every turn sitting inside the context of the ones before it. Not a bag of unrelated log lines that happen to share an id. An actual trajectory.

That capability is what this series is about. Galileo now treats a multi-turn conversation as a first-class citizen: a **Session**. Every turn is grouped under one native Session record, and the agentic scorers get to grade each turn inside the conversation it actually belongs to. That reframes evaluation from "grade the answers" to "grade the journey," which, per everything above, is the version that actually tells you something about an agent.

## Why a coding agent is the vehicle

To explore a capability like that, you want a real workload, not a toy. Something that produces long, genuinely agentic, multi-turn conversations, where each turn is a real decision and the whole thing is messy in the way real usage is messy.

A coding agent is almost unfairly good for this. I use one every day. Every working session with it is a long conversation of many turns, and every turn is exactly the kind of decision worth grading: read this file, search the codebase, run that command, go look something up, hand off to a subagent. It plans, it acts, it reacts. And conveniently, the full transcript of every session is already written to disk, so I have a stack of real trajectories sitting there waiting to be evaluated.

I want to be clear about the framing, though, because it's easy to lose: **the coding agent is the specimen, not the subject.** This series is not really about coding agents, or about how well any particular one picks its tools. It's about what it takes to evaluate an agent's trajectory at all, and a coding agent just happens to be the most convenient, most honest source of real trajectories I could point at. Wherever you run agents, the shape of the problem is the same.

## What the series covers

Here's the road ahead.

- **Part 2 gets into Galileo Sessions itself:** how a stream of turns becomes one native Session, and, more importantly, the non-obvious consequences of taking trajectories seriously. Chief among them the one I hinted at above, that a turn often can't be judged without the conversation around it, and what you have to do about that. Plus the sharp edges: re-sending the same session without piling up duplicates, and what happens to a Session when a conversation gets resumed later under a new identity.
- **A later part picks one concrete agentic metric** and goes deep on what it actually takes to make an automated judge grade decisions well, rather than nod along at everything. That part is where the war stories live.

This is a build log at heart, so expect the useful material to be in the detours: the assumptions that turned out wrong, the score that looked great and meant nothing, the fix that was obvious only in hindsight. That's the stuff worth writing down.

If you only take one idea from this opener, take this one: **the moment your system stops giving answers and starts taking journeys, your evaluation has to grow up and grade the journey.** The rest of the series is about doing that honestly.

---

**Next in the series:** [Part 2, Galileo Sessions: Grading the Whole Conversation](/posts/galileo-sessions-grading-the-whole-conversation), where the trajectory idea meets the actual feature and its sharp edges.
