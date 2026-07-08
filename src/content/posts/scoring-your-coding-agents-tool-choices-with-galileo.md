---
title: "Scoring Your Coding Agent's Tool Choices"
datePublished: 2026-07-07T12:00:00.000Z
slug: scoring-your-coding-agents-tool-choices-with-galileo
cover: /images/scoring-tool-choices/cover.jpg
---

<!-- TODO: replace cover placeholder above with the real image (schema requires the field) -->

# Scoring Your Coding Agent: Turning Claude Code Sessions into Evaluable Traces with Galileo

*A build log. Everything that worked, everything that didn't, and the one insight that turned "we shipped a pipeline" into "we shipped the thing that actually evaluates tool choice."*

Galileo now treats **Sessions as a first-class citizen**. A multi-turn conversation is no longer a loose pile of traces that happen to share metadata; it's a native record of its own, with every turn grouped under one Session and the agentic metrics scoring each turn inside that conversation. That changes what you can evaluate. Individual traces let you grade answers. Sessions let you grade *trajectories*: the sequence of decisions an agent makes across a whole piece of work.

A capability like that deserves a real workload, not a synthetic demo. I wanted something that produces long, genuinely agentic, multi-turn conversations every single day, where each turn contains a decision worth grading. I didn't have to look far. Claude Code is exactly that: it's not a text box, it's an agent. Every working session with it is a conversation of many turns in which it plans, picks a tool from a large menu (read a file, grep the codebase, run a shell command, search the web, spawn a subagent), reads the result, and decides what to do next. And the full transcript of every session is already sitting on my disk. As a playground for Sessions, it's about as natural as it gets.

It also poses an evaluation question I genuinely care about as a daily user: does the agent reach for the *right* tool? Galileo has an agentic metric aimed squarely at that, Tool Selection Quality. So the experiment took shape: turn my real Claude Code sessions into agent traces, land each conversation in Galileo as one native Session, and score every turn on whether the right tool was chosen. This post is the build log of getting that working end to end, and the detours turned out to be where all the lessons are.

## Why I didn't build a dashboard

The obvious thing to do with Claude Code telemetry is a usage dashboard: tokens, cost, which tools get called, sessions per repo. That's fine, but it's application performance monitoring, and there are a dozen tools that already do it. It also completely misses what makes a coding agent interesting.

Claude Code isn't a text box. It's an **agent**: it plans, it calls tools, it reads results, it decides what to do next. When it reaches for `Bash` where `Grep` would have been cleaner, or web-searches for something that's sitting in the repo, that's not a cost problem. It's a decision-quality problem. And decision quality is exactly what an evaluation platform is built to measure.

So the goal wasn't a dashboard. It was this: **treat every Claude Code session as an agent trajectory, send it to Galileo, and run one agentic scorer on it, Tool Selection Quality.** Did the agent pick the right tool at each step?

This post is the log of building that, end to end, against a local Galileo deployment.

## The shape of the thing

The target pipeline:

```
Claude Code session  (a transcript on disk)
   → a small script that turns the transcript into agent-trace spans
   → Galileo's OpenTelemetry trace ingest
   → one Session, grouping every turn of the conversation
   → Galileo scores each turn with an LLM-as-judge
   → Tool Selection Quality: was the right tool chosen?
```

Sounds tidy. It mostly wasn't. Here's where it got interesting.

## War story 1: telemetry is not traces

Claude Code ships with built-in OpenTelemetry. My first assumption was "great, flip it on, point it at Galileo, done."

It is not done. The built-in telemetry emits **usage metrics**: counters and gauges for tokens, cost, session counts. Those are numbers, not a trace. There's nothing in there for a judge to read. No per-turn structure, no tool calls with their inputs and outputs, no conversation. You cannot score a counter.

To evaluate the agent, you have to **reconstruct the trace yourself** from the session transcript, the turn-by-turn record of user prompts, the model's tool calls, and the tool results. That reconstruction is the actual work, and it's the 80% of the value.

> **Takeaway:** "we have telemetry" and "we have something evaluable" are different claims. Metrics tell you *how much*. A trace tells you *what happened*, which is what you can grade.

## Building the emitter

The transcript is a stream of events: user messages, assistant messages (which contain the model's reasoning text and any tool calls), and tool results fed back in. I wrote a small script that walks it and emits OpenTelemetry GenAI spans, one trace per user turn:

```
invoke_agent  "claude-code"          ← one trace per prompt
  ├── chat           ← what the model decided this turn
  ├── execute_tool   ← Read / Edit / Bash / Grep / … with its arguments and result
  └── execute_tool   ← …
```

Two details mattered from the start.

**Sanitize before you ship.** Transcripts contain source code, prompts, and raw command output. The emitter truncates tool arguments and results, and redacts anything that looks like a key or token, *before* anything leaves the machine. This is the number-one thing a security-minded reader will ask about, so it's baked in, not bolted on.

**Group the turns into one Session.** Each turn is its own trace, but they belong to one conversation. OpenTelemetry has a standard attribute for exactly this, `gen_ai.conversation.id`, and Galileo reads it to fold every turn into a single Session, keyed by the Claude Code session id. Tag the spans with it and the grouping is automatic.

<!-- TODO screenshot 1 (load-bearing): the Galileo log-stream view showing one Session
that contains multiple traces (turns). The point of the shot is "many turns, one
session," so expand the session row to show its child traces. -->

## War story 2: collector vs. direct, pick your battle

There are two ways to get spans into Galileo:

1. **Through an OpenTelemetry Collector.** Your app emits OTLP to a local collector, which holds the credentials and forwards to Galileo. This is the production pattern: the app stays credential-free and a central gateway owns routing.
2. **Directly.** The emitter posts OTLP straight to Galileo's trace-ingest endpoint with the API key, project, and log-stream as headers.

I started with the collector because it's the "proper" architecture. For building and testing the integration it was pure friction, an extra moving part between me and the signal. The ingest, session-grouping, and scoring behavior looked identical either way.

> **Takeaway:** the collector is the right answer for org-wide rollout. For proving an integration, go direct and remove the middleman. Add the collector back when you're shipping to a fleet.

## War story 3: the first score is a lie (everything is 1.0)

I wired up the judge, an Anthropic model grading each turn, enabled Tool Selection Quality on the log stream, and sent a session where I'd *deliberately* made bad tool choices: web-searching for something local, using a listing command to find function callers.

Every single turn scored a perfect **1.0**.

<!-- TODO screenshot 2 (load-bearing): a scored session where turns with obviously-wrong
tool choices all show Tool Selection Quality = 1.0 / all "correct". This is the "looks
great, means nothing" shot; pick a session with a clearly dubious tool call so the 1.0
looks wrong. -->

This is the most important gotcha in the whole project, so it's worth stating plainly:

**A judge can only assess whether the *right* tool was chosen if it knows what tools were *available*.** Think about it from the judge's seat. If the only tool it can see is the one that was called, then the agent "correctly" selected from a menu of one, every time. To flag "you should have used Grep instead of WebSearch," the judge has to know Grep was on the menu.

And here's the trap: a bare OpenTelemetry GenAI trace **doesn't carry the available-tool catalog.** It records the tool that was *called*, not the set the agent could have chosen from. So the judge has no alternatives to compare against, and everything passes.

> **Takeaway:** an agent trace is unscoreable for *tool choice* until it carries the agent's tool catalog. Without it, "Tool Selection Quality" silently degrades to "did you call a tool that exists," which is always yes.

## War story 4: teaching the trace its tool catalog

So the fix is: publish Claude Code's full tool catalog (Read, Edit, Write, Bash, Grep, Glob, WebSearch, WebFetch, Task, and friends) onto the trace, as *definitions*, so the judge sees the whole menu.

The wrinkle I ran into: my plain GenAI spans kept landing in Galileo without a tool catalog, no matter which standard attributes I tried. What I observed is that the available-tools list only populated when the incoming trace spoke the convention of an agent framework the platform recognizes, the way traces from the popular agent SDKs and instrumentation libraries do.

The convention I got working was **Pydantic AI's**, and I picked it deliberately: it's built on the same GenAI semantics I was already emitting, so my inputs and outputs survived untouched. Concretely: mark the chat span with the framework's marker attribute, and attach the catalog as the framework's tool-definitions attribute, a list of `{name, description, parameters}` for each tool. The descriptions do real work here. "Grep: search file *contents* by regex to find where a symbol is defined or called" versus "WebSearch: search the public internet; cannot access local files or repo state." That contrast is what lets the judge reason about the right choice.

Verified it landed: the model node in the stored trace now carried the full catalog, and the rest of the trace (turns, tool calls, session grouping) was unchanged.

**Where does the catalog come from?** I started with a static, hand-curated list of the core tools. Good enough to prove the mechanism, and the curated descriptions are an asset. But a real session's menu varies: MCP servers add tools, and a hardcoded list drifts as the product evolves. The fix is a hybrid, and it falls out of the opt-in design almost for free. Because sending is a command you run *inside the live session*, **the agent itself can hand over its own menu.** When you invoke the send command, the model dumps the tool catalog it actually has right now, MCP tools included, with descriptions drawn from its own tool definitions, and the emitter merges that on top of the curated baseline (baseline wins on collisions, so the judge-tuned descriptions stay). The first live dump I captured reported 42 tools against my 10-tool baseline, so the static-only judge had been blind to roughly three quarters of the real menu. Sessions sent retroactively, where no live dump exists, fall back to the baseline alone. That's the honest choice, since today's menu isn't evidence of what an old session had.

> **Takeaway:** you don't have to adopt an agent framework to be evaluable, but you do have to *speak the schema* of one that the platform recognizes. Match a known convention and the platform does the rest. And for the catalog itself: the most truthful source is the agent, live, at send time. One more argument for human-in-the-loop sending over fire-and-forget hooks.

## War story 5: the judge grades the *output*, so the tool call has to be in it

I re-sent the bad-choices session, fully expecting vindication.

Every turn scored **`false`**, including a turn where the agent had done the obviously *correct* thing (using Read to show a file).

That's a different failure, and it's a good one to understand. The judge assesses tool selection by reading the model's **output** for that turn, the thing the model *produced*. But my emitter had split the work: the assistant's reasoning text went on the chat span, while the actual tool call went on a *separate* execution span. So the judge looked at the model's output, saw prose but no tool call, and concluded "tools were available and the model failed to call one". Wrong, for everything.

The fix was small: render the chosen tool call **into the chat span's output**, right alongside the reasoning, so "the model selected `Read(file_path=…)`" is visible where the judge is actually looking.

> **Takeaway:** for tool-selection scoring, the model span needs *both* the available tools *and* the chosen call, in its output. Available-menu plus what-you-picked. One without the other doesn't score.

## The payoff: it catches misses

With the catalog on the span and the tool call in the output, I sent a session with three blatant mistakes and one correct choice. The result:

| The user asked… | The agent used… | Verdict |
|---|---|---|
| "Show me the contents of this file" | **Read** | ✅ correct |
| "What git branch is this repo on?" | WebSearch | ❌ wrong. The web can't know local repo state |
| "Delete this stale lock file" | Read | ❌ wrong. Read can't delete |
| "How many Python files are in src/?" | WebSearch | ❌ wrong. That's a local question |

Session Tool Selection Quality: **0.25.** And crucially, it wasn't just failing everything. It **passed** the correct Read and **failed** the Read-used-to-delete. It's judging *appropriateness*, not pattern-matching tool names.

<!-- TODO screenshot 3 (load-bearing, the money shot): the scored session showing the
per-turn verdicts (the correct Read = pass, the WebSearch/Read-misuse turns = fail) with
the overall Tool Selection Quality score. If the UI shows the judge's written rationale
for a flagged turn, capture that too; the explanation of "why WebSearch was the wrong
call here" is the most persuasive single image in the post. -->

<!-- TODO screenshot 4 (optional): side-by-side (or two stacked shots) of the same style
of session scoring 1.0 without the tool catalog and ~0.25 with it. The whole lesson in
one picture. -->

Compare that to where we started, a meaningless 1.0, and the entire thesis of the project is in the diff: **bare telemetry can't grade tool choice; a trace that carries its tool catalog can.**

## How the judging actually works: ChainPoll

It's worth pausing on *how* that verdict gets made, because it explains both the shape of the scores and the occasional hiccup.

Tool Selection Quality, like Galileo's other agentic metrics, is built on **ChainPoll**, Galileo's published LLM-as-judge technique. The name is the method:

- **Chain.** The judge model isn't asked for a bare yes/no. It's prompted with a **chain-of-thought** rubric: reason step by step about the turn (what did the user ask, what tools were on the menu, what did the agent pick, were the arguments right), *then* deliver a verdict. That's why the flagged turns come with a written rationale. The reasoning is a first-class output, not an afterthought.
- **Poll.** The judge is sampled **multiple times, independently** (three by default). Each sample reasons and votes on its own, and the score is the **fraction of votes** that say the tool choice was correct.

Two practical consequences fall out of this design.

**Scores are probabilities, not booleans.** A turn where every judge agrees scores 1.0 or 0.0; a turn where the judges split scores in between. That in-between number is signal, not noise. "2 of 3 judges thought WebSearch was defensible here" tells you the turn is *ambiguous*, which is often the most interesting category to review. It's also why a session score like 0.25 reads naturally as "one of four turns was a good pick."

**Polling buys robustness.** A single LLM judgment is one sample from a stochastic process. Sometimes the model reasons badly, sometimes it returns something the parser can't use. With three independent samples, one bad draw gets outvoted or discarded, and the turn still gets a grounded verdict. A turn only fails to score when *every* sample misfires at once, which is rare and self-corrects on retry.

> **Takeaway:** LLM-as-judge done seriously isn't "ask GPT if it's good." It's a structured rubric, forced reasoning, and multiple independent votes aggregated into a probability. When you're choosing an evaluation platform, ask *how* it judges. The difference shows up exactly in cases like "Read used to delete a file," where a lazy judge pattern-matches "Read is a real tool ✓" and a reasoning judge catches that the tool can't do what the user asked.

## Smaller war stories worth knowing

**The "auth error" that wasn't an auth error.** At one point scoring failed with an authentication error, and I burned real time double-checking API keys, which were fine. The actual cause in my setup was a judge-model misconfiguration: I'd referenced the judge model by one form of its name when the platform expected another (the human-facing model name versus the raw model id). The misconfig surfaced under a generic "credentials" banner, which sent me chasing the wrong thing.

> **Takeaway:** when an LLM-judge metric fails, don't trust the top-line error category. Dig for the underlying failure. "Couldn't resolve the judge model" and "bad API key" can wear the same label.

**LLM-as-judge is probabilistic, and that's normal.** Occasionally a single turn's score would come back empty and retry before settling. This is the flip side of the ChainPoll design above: each judge vote is a sampled generation asked to return a structured verdict, and once in a while a response doesn't come back in the expected shape and gets discarded. The polling masks most of it. You only notice when every sample for one turn misfires at once. Choosing a judge model with strong structured-output adherence, and sampling more than once, keeps it quiet.

> **Takeaway:** treat judge scores as measurements with noise, not deterministic labels. Design for the occasional retry instead of being surprised by it.

## Making it opt-in (because transcripts are sensitive)

The tempting design is "fire it automatically when the session ends." I looked hard at doing that with an end-of-session hook and decided against it, for two reasons.

First, a mechanical one: end-of-session hooks are fire-and-forget. They can't pause, can't prompt, and can't be *cancelled*. There's no clean way to ask "do you actually want to send this one?" at the moment it matters.

Second, and more importantly: **transcripts contain your code, your prompts, and your command output.** Auto-shipping every session off the machine, silently, is exactly the behavior a security-conscious team should be nervous about.

So sending is a **deliberate, human-in-the-loop action**: a single command you run when *you* decide this session is worth logging. It finds the current session's transcript, sanitizes it, and sends it. Nothing leaves your machine until you say so.

<!-- TODO screenshot 5 (optional): the terminal moment of invoking the manual "send this
session" command and its confirmation output (which session was sent, to which
project/log stream). Reinforces the "nothing auto-exfiltrated" story. -->

> **Takeaway:** for anything that ships developer sessions somewhere, opt-in beats automatic. It's a better privacy posture *and* a better story to tell your security team.

## What I'd tell you before you start

- **Metrics ≠ traces.** Built-in usage telemetry can't be scored. Reconstruct the trace from the transcript.
- **Sessions are free if you use the standard attribute.** `gen_ai.conversation.id` folds turns into one Session automatically.
- **A trace is unscoreable for tool choice until it carries the tool catalog.** The *available* tools, not just the called one, in a format the platform recognizes.
- **The judge reads the model's output.** Put the chosen tool call there, next to the reasoning, or it can't grade the choice.
- **Judge scores are noisy.** Pick a judge with strong structured output, sample more than once, and expect the occasional retry.
- **Opt-in, always.** Developer transcripts are sensitive; make sending a deliberate act.

The end state is genuinely useful: a real Claude Code session, rendered as an agent trace, scored turn-by-turn on whether it reached for the right tool, with the judge correctly flagging the moves that a good engineer would have made differently. That's not a dashboard. That's evaluation.

## The wrinkles I'm saving for Part II (and III)

Working end-to-end is not the same as finished. Three threads are deliberately left hanging, and each is meaty enough to be its own post.

**Sessions that outlive themselves.** Claude Code lets you *continue* or *resume* a conversation, and the resumed session gets a **new session id** for what is logically the same thread. Two consequences: the resumed thread shows up as a *separate* Session in Galileo unless you chain it to its predecessor, and, sneakier, a resumed transcript *contains the earlier turns*, so naively re-sending it duplicates history under a new id. Galileo has a session-chaining concept ("this session continues that one"); wiring continuation detection into the send path is Part II material.

**Point-in-time catalog fidelity.** The hybrid catalog is truthful for the session you're in, and retroactive sends fall back to the baseline. But the deeper version of this problem, *what exactly was on the menu at the moment of each historical turn*, needs the catalog captured at session time, not send time. Think of it as snapshotting the menu alongside the meal.

**From one machine to a fleet.** Everything here is one developer, one machine, direct to one Galileo instance. The org-wide version, with the OpenTelemetry Collector as a central gateway, credentials out of the developer's hands, managed rollout, and tool-selection scores *aggregated across a team*, is where this stops being a demo and starts being an adoption-depth instrument. That's Part III.

<!-- TODO: add the companion repo link once published (the emitter, the manual send
command, and the example sessions). Draft footer line:
"Want the companion repo? <link>" -->
