---
title: "Scoring Your Coding Agent's Tool Choices"
datePublished: 2026-08-05T12:00:00.000Z
slug: scoring-your-coding-agents-tool-choices-with-galileo
cover: https://dhbtuus86mod.cloudfront.net/scoring-coding-agent-tool-choices.png
---

*Part 3 of a series on evaluating agents with Galileo*

[Part 1](/posts/evaluating-agents-is-a-trajectory-problem) argued you have to grade an agent's trajectory, not just its final answer. [Part 2](/posts/galileo-sessions-grading-the-whole-conversation) got a real conversation into Galileo as one native Session and showed that a turn can't be judged without its context. This part picks one concrete metric and pushes on what it actually takes to make an automated judge grade a decision well.

Parts 1 and 2 built the stage. A coding agent's conversation lands in Galileo as a single Session, every turn grouped, the surrounding context attached so each turn is gradeable at all. But I was hand-waving the actual grading the whole time. A judge handed down verdicts, and I never stopped to ask whether those verdicts were any good, or what it took to make them good.

This part does. I picked one agentic metric and went deep on it: **Tool Selection Quality**. At every turn the agent chose a tool from its menu, and this metric asks the obvious question, did it choose well? That sounds like the easiest thing in the world to score. It was the single hardest thing to get right in the whole project, and the reasons why are the interesting part.

## A fixture designed to fail

To find out whether the judge could actually catch a bad tool choice, I built a small session that makes them on purpose. Four turns, one good choice and three howlers:

- "Show me the contents of a file" and the agent uses **Read**. Correct.
- "What git branch is this repo on?" and the agent uses **WebSearch**. Wrong. The public web cannot know your local repo state.
- "Delete this stale lock file" and the agent uses **Read**. Wrong. Read cannot delete anything.
- "How many Python files are in src/?" and the agent uses **WebSearch**. Wrong. That is a local question.

In transcript form, each turn is a user message plus the assistant's tool call. Abbreviated to the first two turns:

```json
// turn 1 - correct: Read to show a file
{ "type": "user", "message": { "role": "user", "content": "Show me the contents of src/server.py" } }
{ "type": "assistant", "message": { "role": "assistant", "model": "claude-opus-4-8",
  "content": [ { "type": "text", "text": "I'll read that file." },
    { "type": "tool_use", "id": "g1", "name": "Read", "input": { "file_path": "src/server.py" } } ] } }

// turn 2 - wrong: WebSearch for local repo state
{ "type": "user", "message": { "role": "user", "content": "What git branch is THIS repo currently on?" } }
{ "type": "assistant", "message": { "role": "assistant", "model": "claude-opus-4-8",
  "content": [ { "type": "text", "text": "Let me look that up online." },
    { "type": "tool_use", "id": "w1", "name": "WebSearch", "input": { "query": "how to find current git branch" } } ] } }
```

Reconstructed into spans and sent to Galileo the way Part 2 describes, this became one Session of four scored turns. My expectation was simple: one pass, three fails. Then I turned on Tool Selection Quality.

## War story 1: the first score is a lie (everything is 1.0)

Wiring up an LLM as the judge is a bit of Galileo setup I'll leave to their documentation. I pointed it at an Anthropic model, enabled the built-in `Tool Selection Quality` metric on the log stream, and sent my fixture full of deliberately bad choices.

Every single turn scored a perfect **1.0**.

![A Claude Code session scored by Tool Selection Quality where every turn shows "true" for a perfect 1.0, even though the agent web-searched for local git state and used Read to try to delete a file. Without the tool catalog on the span, the judge sees no alternatives and passes everything.](https://dhbtuus86mod.cloudfront.net/Shot2_the%20false1_0_without-catalog.png)

This is the most important gotcha in the whole project, so it's worth stating plainly:

**A judge can only assess whether the _right_ tool was chosen if it knows what tools were _available_ and what they are for.** Think about it from the judge's seat. If the only tool it can see is the one that was called, then the agent "correctly" selected from a menu of one, every time. To flag "you should have used Grep instead of WebSearch," the judge has to know Grep was on the menu at all.

And here is the trap: a bare OpenTelemetry GenAI trace **doesn't carry the available-tool catalog**. It records the tool that was _called_, not the set the agent could have chosen from. That list isn't an enrichment the judge merely benefits from; it's a structural input the metric is built to read. Leave it off and the judge has no alternatives to compare against, so it doesn't get cautious, it gets toothless, and everything passes.

> **Takeaway:** an agent trace is unscoreable for _tool choice_ until it carries the agent's tool catalog. The available-tools list isn't optional context, it's what the metric keys off. Without it, "Tool Selection Quality" silently degrades to "did you call a tool that exists," which is always a yes.

## War story 2: teaching the trace its tool catalog

So the fix is to publish the agent's full tool catalog (Read, Edit, Write, Bash, Grep, Glob, WebSearch, WebFetch, Task, and friends) onto the trace, as _definitions_, so the judge sees the whole menu.

The wrinkle I ran into: my plain GenAI spans kept landing in Galileo without a tool catalog, no matter which standard attributes I tried. What I observed is that the available-tools list only populated when the incoming trace spoke the convention of an agent framework the platform recognizes, the way traces from the popular agent SDKs and instrumentation libraries do.

The convention I got working was **Pydantic AI's**, and I picked it deliberately because it's built on the same GenAI semantics I was already emitting, so my inputs and outputs survived untouched. Specifically, mark the chat span with the framework's marker attribute, and attach the catalog as the framework's tool-definitions attribute, a list of `{name, description, parameters}` for each tool. The descriptions do the real work here. "Grep: search file _contents_ by regex to find where a symbol is defined or called" versus "WebSearch: search the public internet; cannot access local files or repo state." That contrast is what lets the judge **reason** about the right choice.

Verified it landed: the model node in the stored trace now carried the full catalog, and the rest of the trace (turns, tool calls, session grouping) was unchanged. Here's what the chat span carries once the catalog is attached, abridged to the two entries that decide the verdicts below:

```json
[
  {
    "name": "Grep",
    "description": "Search file CONTENTS across the codebase with a regex. Use to find where a symbol or function is defined or called.",
    "parameters": {
      "type": "object",
      "properties": { "pattern": { "type": "string" }, "path": { "type": "string" }, "glob": { "type": "string" } },
      "required": ["pattern"]
    }
  },
  {
    "name": "WebSearch",
    "description": "Search the PUBLIC internet. Cannot access local files, the repository, or runtime state.",
    "parameters": {
      "type": "object",
      "properties": { "query": { "type": "string" } },
      "required": ["query"]
    }
  }
  // ... plus Read, Edit, Write, Bash, Glob, WebFetch, Task, TodoWrite
]
```

Ten tools, each with the shape the judge needs: a name, a schema, and above all a description that says what the tool is *for*. Read those two descriptions the way a judge would, and "what git branch is this repo on?" stops being a coin flip.

**Where does the catalog come from?** I started with a static, hand-curated list of the core tools. Good enough to prove the mechanism, and the curated descriptions are an asset. But a real session's menu varies: MCP servers add tools, and a hardcoded list drifts as the product evolves.

The fix is a hybrid, and it falls out of a design choice I'll cover in full later on: sending is **opt-in**. Rather than a background hook that fires automatically when a session ends, sending is a command you deliberately run from inside the live session (transcripts hold your code and prompts, so I wanted a human in the loop, more on that below). That choice pays an unexpected dividend here. Because the command runs while the session is still alive, **the agent itself can hand over its own menu.** When you invoke the send command, the model dumps the tool catalog it actually has right now, MCP tools included, with descriptions drawn from its own tool definitions, and the emitter merges that on top of the curated baseline (baseline wins on collisions, so the judge-tuned descriptions stay). The first live dump I captured reported 42 tools against my 10-tool baseline, so the static-only judge had been blind to roughly three quarters of the real menu. Sessions sent retroactively, where no live dump exists, fall back to the baseline alone.

> **Takeaway:** you don't have to adopt an agent framework to be evaluable, but you do have to _speak the schema_ of one that the platform recognizes. Match a known convention and the platform does the rest. And for the catalog itself, the most truthful source is the agent, live, at send time. One more argument for human-in-the-loop sending over fire-and-forget hooks.

## War story 3: the judge grades the _output_, so the tool call has to be in it

I re-sent the bad-choices session, fully expecting vindication.

Every turn scored **`false`**, including the turn where the agent had done the obviously _correct_ thing (using Read to show a file).

That's a different failure, and it's a good one to understand. The judge reads the whole LLM span for a turn: the user's ask, the available tools, and the model's **output**, the part it actually _produced_. That produced output is where it expects to find the tool call. But my emitter had split the work: the assistant's reasoning text went on the chat span, while the actual tool call went on a _separate_ execution span. So the judge looked at the produced output, saw prose but no tool call, and concluded "tools were available and the model failed to call one." Wrong, for everything.

The fix was small: render the chosen tool call **into the chat span's output**, right alongside the reasoning, so "the model selected `Read(file_path=...)`" is visible where the judge is actually looking.

> **Takeaway:** for tool-selection scoring, the model span needs _both_ the available tools _and_ the chosen call, in its output. Available menu plus what-you-picked. One without the other doesn't score.

## The payoff: it catches misses

With the catalog on the span and the tool call in the output, I sent the fixture one more time:

| The user asked…                      | The agent used… | Verdict                                       |
| ------------------------------------ | --------------- | --------------------------------------------- |
| "Show me the contents of this file"  | **Read**        | ✅ correct                                    |
| "What git branch is this repo on?"   | WebSearch       | ❌ wrong. The web can't know local repo state |
| "Delete this stale lock file"        | Read            | ❌ wrong. Read can't delete                   |
| "How many Python files are in src/?" | WebSearch       | ❌ wrong. That's a local question             |

Session Tool Selection Quality: **0.25.** And crucially, it wasn't just failing everything. It **passed** the correct Read and **failed** the Read-used-to-delete. It's judging _appropriateness_, not pattern-matching tool names.

![The same session scored with the tool catalog attached: Tool Selection Quality drops to 0.25. The Read turn passes, while the two WebSearch-for-local-state turns and the Read-used-to-delete turn are all flagged as wrong tool choices.](https://dhbtuus86mod.cloudfront.net/Shot3_money%20shot_with-catalog.png)

Click into a flagged turn and the judge shows its reasoning, not just a verdict:

![The judge's written rationale for a flagged turn, explaining step by step why WebSearch was the wrong tool for a question about local repository state when Bash was available on the menu.](https://dhbtuus86mod.cloudfront.net/Shot3_1_the_judges_rationale.png)

![Side by side: the identical four-turn session scored twice. On the left, without the tool catalog, every turn is "true" for 1.0 and the assistant bubbles show only prose. On the right, with the catalog, three turns are flagged "false" for 0.25 and the bubbles show the actual tool call the model chose. Same input, opposite verdicts.](https://dhbtuus86mod.cloudfront.net/Shot4_side-by-side_same%20fixture_catalog_off_shot2_vs_shot3_catalog_on.png)

Compare that to where we started, a meaningless 1.0, and the entire thesis of this part is in the diff: **bare telemetry can't grade tool choice; a trace that carries its tool catalog can.**

## How the judging actually works: ChainPoll

It's worth pausing on _how_ that verdict gets made, because it explains both the shape of the scores and the occasional hiccup.

Tool Selection Quality, like Galileo's other agentic metrics, is built on **ChainPoll**, Galileo's published LLM-as-judge technique. The name is the method:

- **Chain.** The judge model isn't asked for a bare yes/no. It's prompted with a **chain-of-thought** rubric: reason step by step about the turn (what did the user ask, what tools were on the menu, what did the agent pick, were the arguments right), _then_ deliver a verdict. That's why the flagged turns come with a written rationale. The reasoning is a first-class output, not an afterthought.
- **Poll.** The judge is sampled **multiple times, independently** (three by default). Each sample reasons and votes on its own, and the score is the **fraction of votes** that say the tool choice was correct.

Two practical consequences fall out of this design.

**Scores are probabilities, not booleans.** A turn where every judge agrees scores 1.0 or 0.0; a turn where the judges split scores in between. That in-between number is signal, not noise. "2 of 3 judges thought WebSearch was defensible here" tells you the turn is _ambiguous_, which is often the most interesting category to review. It's also why a session score like 0.25 reads naturally as "one of four turns was a good pick."

**Polling buys robustness.** A single LLM judgment is one sample from a stochastic process. Sometimes the model reasons badly, sometimes it returns something the parser can't use. With three independent samples, one bad draw gets outvoted or discarded, and the turn still gets a grounded verdict. A turn only fails to score when _every_ sample misfires at once, which is rare and self-corrects on retry.

> **Takeaway:** LLM-as-judge done seriously isn't "ask GPT if it's good." It's a structured rubric, forced reasoning, and multiple independent votes aggregated into a probability. When you're choosing an evaluation platform, ask _how_ it judges. The difference shows up exactly in cases like "Read used to delete a file," where a lazy judge pattern-matches "Read is a real tool ✓" and a reasoning judge catches that the tool can't do what the user asked.

## Smaller war stories worth knowing

**The "auth error" that wasn't an auth error.** At one point scoring failed with an authentication error, and I burned real time double-checking API keys, which were fine. The actual cause in my setup was a judge-model misconfiguration: I'd referenced the judge model by one form of its name when the platform expected another (the human-facing model name versus the raw model id). The misconfig surfaced under a generic "credentials" banner, which sent me chasing the wrong thing.

> **Takeaway:** when an LLM-judge metric fails, don't trust the top-line error category. Dig for the underlying failure. "Couldn't resolve the judge model" and "bad API key" can wear the same label.

**LLM-as-judge is probabilistic, and that's normal.** Occasionally a single turn's score would come back empty and retry before settling. This is the flip side of the ChainPoll design above: each judge vote is a sampled generation asked to return a structured verdict, and once in a while a response doesn't come back in the expected shape and gets discarded. The polling masks most of it. You only notice when every sample for one turn misfires at once. Choosing a judge model with strong structured-output adherence, and sampling more than once, keeps it quiet.

> **Takeaway:** treat judge scores as measurements with noise, not deterministic labels. Design for the occasional retry instead of being surprised by it.

## Making it opt-in (because transcripts are sensitive)

I mentioned above that sending a session is a deliberate act rather than an automatic one. Here is the full reasoning, because it's the same choice that made the live tool catalog possible.

The tempting design is "fire it automatically when the session ends." I looked hard at doing that with an end-of-session hook and decided against it, for two reasons.

First, a mechanical one: end-of-session hooks are fire-and-forget. They can't pause, can't prompt, and can't be _cancelled_. There's no clean way to ask "do you actually want to send this one?" at the moment it matters.

Second, and more importantly: **transcripts contain your code, your prompts, and your command output.** Auto-shipping every session off the machine, silently, is exactly the behavior a security-conscious team should be nervous about.

So sending is a **deliberate, human-in-the-loop action**: a single command you run when _you_ decide this session is worth logging. It finds the current session's transcript, sanitizes it, and sends it. Nothing leaves your machine until you say so. And, as War story 2 showed, running from inside the live session is exactly what lets the agent report its own current tool menu.

<!-- TODO screenshot 5 (optional): the terminal moment of invoking the manual "send this
session" command and its confirmation output (which session was sent, to which
project/log stream). Reinforces the "nothing auto-exfiltrated" story. -->

> **Takeaway:** for anything that ships developer sessions somewhere, opt-in beats automatic. It's a better privacy posture _and_ a better story to tell your security team.

## What I'd tell you before you start

- **A trace is unscoreable for tool choice until it carries the tool catalog.** The _available_ tools, not just the called one, in a format the platform recognizes.
- **The judge reads the model's output.** Put the chosen tool call there, next to the reasoning, or it can't grade the choice.
- **The most truthful catalog comes from the live agent.** Dump the menu at send time, from inside the session, MCP tools and all, rather than trusting a hardcoded list.
- **Judge scores are noisy.** Pick a judge with strong structured output, sample more than once, and expect the occasional retry.
- **Opt-in, always.** Developer transcripts are sensitive; make sending a deliberate act.

The end state is genuinely useful: a real coding-agent session, rendered as an agent trace, scored turn-by-turn on whether it reached for the right tool, with the judge correctly flagging the moves a good engineer would have made differently. That's not a dashboard. That's evaluation, which is exactly where this series started.

## What's still open

Two threads I'm deliberately leaving for later.

**Point-in-time catalog fidelity.** The live catalog is truthful for the session you send from, and retroactive sends fall back to the baseline. The deeper problem, _what exactly was on the menu at the moment of each historical turn_, needs the catalog captured at session time rather than send time. Think of it as snapshotting the menu alongside the meal.

**Everything cloud-native.** This whole series is one developer, one machine, sending sessions by hand to one Galileo instance. Taking it further, persisting and resuming a conversation across time and machines, chaining the sessions that outlive their identity (the sharp edge from Part 2), a durable thread registry, an event-driven send pipeline, credentials off the laptop, and tool-selection scores aggregated across a team, is a genuine engineering effort rather than an editorial one. It needs the emitter refactored and new hooks for cloud integration, so it earns its own series rather than a paragraph here. That's where I'm headed next.

<!-- TODO: add the companion repo link once published (the emitter, the manual send
command, and the example sessions). Draft footer line:
"Want the companion repo? <link>" -->
