---
title: "Scoring Your Coding Agent's Tool Choices"
datePublished: 2026-07-07T12:00:00.000Z
slug: scoring-your-coding-agents-tool-choices-with-galileo
cover: https://dhbtuus86mod.cloudfront.net/coding-agent-tool-choices.jpg
---

# Scoring Your Coding Agent: Turning Claude Code Sessions into Evaluable Traces with Galileo

Galileo now treats **Sessions as a first-class citizen**. A multi-turn conversation is no longer a loose pile of traces that happen to share metadata; it's a native record of its own, with every turn grouped under one Session and the agentic metrics scoring each turn inside that conversation. That changes what you can evaluate. Individual traces let you grade answers. Sessions let you grade _trajectories_: the sequence of decisions an agent makes across a whole piece of work.

A capability like that deserves a real workload, not a synthetic demo. I wanted something that produces long, genuinely agentic, multi-turn conversations every single day, where each turn contains a decision worth grading. I didn't have to look far. Claude Code is exactly that: it's not a text box, it's an agent. Every working session with it is a conversation of many turns in which it plans, picks a tool from a large menu (read a file, grep the codebase, run a shell command, search the web, spawn a subagent), reads the result, and decides what to do next. And the full transcript of every session is already sitting on my disk. As a playground for Sessions, it's about as natural as it gets.

Cluade Code seemed the right fit for this given the multi-turn use case is more the underlying concept I wnated to cover than the actual evaluation part. Galileo has an agentic metric aimed squarely at that, Tool Selection Quality. So the experiment took shape: turn my real Claude Code sessions into agent traces, land each conversation in Galileo as one native Session, and score every turn on whether the right tool was chosen. This post is the build log of getting that working end to end, and the detours turned out to be where all the lessons are.

## The shape of the thing

The target pipeline:

```
Claude Code session  (we'll use a transcript on disk)
   -> a small script that turns the transcript into agent-trace spans
   -> Galileo's OpenTelemetry trace ingest
   -> one Session, grouping every turn of the conversation
   -> Galileo scores each turn with an LLM-as-judge
   -> Tool Selection Quality: was the right tool chosen?
```

Sounds tidy. It mostly wasn't. Here's where it got interesting.

## War story 1: telemetry is not traces

Claude Code ships with built-in OpenTelemetry. My first assumption was "great, flip it on, point it at Galileo, done."

It is not done. The built-in telemetry emits **usage metrics**: counters and gauges for tokens, cost, session counts. Those are numbers, not a trace. There's nothing in there for a judge to read. No per-turn structure, no tool calls with their inputs and outputs, no conversation. You cannot score a counter.

To evaluate the agent, you have to **reconstruct the trace yourself**. To get things going cheaply, I created a fake transcript as placehodler for a Claude Code session that would represent the turn-by-turn record of user prompts, the model's tool calls, and the tool results. Here is an example of the transcript I'm using:

```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": "Show me the contents of src/server.py"
  }
}
{
  "type": "assistant",
  "message": {
    "role": "assistant",
    "model": "claude-opus-4-8",
    "content": [
      {
        "type": "text",
        "text": "I'll read that file."
      },
      {
        "type": "tool_use",
        "id": "g1",
        "name": "Read",
        "input": {
          "file_path": "src/server.py"
        }
      }
    ]
  }
}
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [
      {
        "type": "tool_result",
        "tool_use_id": "g1",
        "content": [
          {
            "type": "text",
            "text": "app = Flask(__name__)\n\n@app.route('/health')\ndef health():\n    return 'ok'"
          }
        ]
      }
    ]
  }
}
{
  "type": "user",
  "message": {
    "role": "user",
    "content": "What git branch is THIS repo currently on, and what's the latest commit hash?"
  }
}
{
  "type": "assistant",
  "message": {
    "role": "assistant",
    "model": "claude-opus-4-8",
    "content": [
      {
        "type": "text",
        "text": "Let me look that up online."
      },
      {
        "type": "tool_use",
        "id": "w1",
        "name": "WebSearch",
        "input": {
          "query": "how to find current git branch and latest commit hash"
        }
      }
    ]
  }
}
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [
      {
        "type": "tool_result",
        "tool_use_id": "w1",
        "content": "Results: 'git branch --show-current' shows the branch; 'git rev-parse HEAD' shows the latest commit. (General articles, not specific to any repository.)"
      }
    ]
  }
}
{
  "type": "user",
  "message": {
    "role": "user",
    "content": "Delete the stale lock file at .git/index.lock so I can commit"
  }
}
{
  "type": "assistant",
  "message": {
    "role": "assistant",
    "model": "claude-opus-4-8",
    "content": [
      {
        "type": "text",
        "text": "I'll open the lock file."
      },
      {
        "type": "tool_use",
        "id": "r2",
        "name": "Read",
        "input": {
          "file_path": ".git/index.lock"
        }
      }
    ]
  }
}
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [
      {
        "type": "tool_result",
        "tool_use_id": "r2",
        "content": "(empty file)"
      }
    ]
  }
}
{
  "type": "user",
  "message": {
    "role": "user",
    "content": "How many Python files are in the src/ directory?"
  }
}
{
  "type": "assistant",
  "message": {
    "role": "assistant",
    "model": "claude-opus-4-8",
    "content": [
      {
        "type": "text",
        "text": "Let me search the web for the answer."
      },
      {
        "type": "tool_use",
        "id": "w2",
        "name": "WebSearch",
        "input": {
          "query": "count python files in a directory"
        }
      }
    ]
  }
}
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [
      {
        "type": "tool_result",
        "tool_use_id": "w2",
        "content": "Results: use 'find src -name \"*.py\" | wc -l' or 'ls src/*.py'. (Generic answers.)"
      }
    ]
  }
}
```

> **Takeaway:** "we have telemetry" and "we have something evaluable" are different claims. Metrics tell you _how much_. A trace tells you _what happened_, which is what you can grade.

## Building the emitter

[emit_claude_trace.py]() is a Claude Code -> Galileo trace emitter, designed to run as a Claude Code SessionEnd/Stop hook. Here is what it does:

it reads a Claude Code session transcript and converts it into GenAI-semantic OpenTelemetry (OTel) spans, sending them to Galileo (an LLM observability platform) so each session can be inspected and scored.

How it works

1. Input - Reads hook JSON from stdin (main()), extracting transcript_path, session_id, and cwd.
2. Parse transcript (load_transcript, build_turns) — Reads the JSONL transcript and segments it into turns: one real user prompt plus everything Claude did until the next prompt. It filters out tool-result feedback (keeping only genuine human turns) and drops empty turns.
3. Emit spans (emit) — For each turn it builds a nested span tree that mirrors an agent trace:
invoke_agent  "claude-code"   (one trace per user prompt)
  ├─ chat          (what Claude decided — reasoning + inline tool calls)
  ├─ execute_tool  (Read / Edit / Bash / MCP tool, with args + results)
  └─ execute_tool
3. Every span carries gen_ai.conversation.id = session_id, which makes Galileo collapse all turns into a single native session record.

The transcript is a stream of events: user messages, assistant messages (which contain the model's reasoning text and any tool calls), and tool results fed back in. I wrote a small script that walks it and emits OpenTelemetry GenAI spans, one trace per user turn:

```
invoke_agent  "claude-code"          ← one trace per prompt
  ├── chat           ← what the model decided this turn
  ├── execute_tool   ← Read / Edit / Bash / Grep / ... with its arguments and result
  └── execute_tool   ← ...
```

Two details mattered from the start.

**Sanitize before you ship.** Transcripts contain source code, prompts, and raw command output. The emitter truncates tool arguments and results, and redacts anything that looks like a key or token, _before_ anything leaves the machine. This is the number one thing a security-minded reader will ask about, so it's baked in, not bolted on.

**Group the turns into one Session.** Each turn is its own trace, but they belong to one conversation. OpenTelemetry has a standard attribute for exactly this, `gen_ai.conversation.id`, and Galileo reads it to fold every turn into a single Session, keyed by the Claude Code session id. Tag the spans with it and the grouping is automatic.

![The Galileo view of one Session expanded to show its child traces: every turn of the Claude Code conversation folded under a single Session via the gen_ai.conversation.id attribute, with each turn's invoke_agent, chat, and tool spans nested beneath it.](https://dhbtuus86mod.cloudfront.net/Shot1_session_grouping.png)

## War story 2: collector vs. direct, pick your battle

There are two ways to get spans into Galileo:

1. **Through an OpenTelemetry Collector.** Your app emits OTLP to a local collector, which forwards to Galileo. This is the usual production pattern because of everything the emitter gets to _not_ do: the collector owns batching, buffering, and retries when the network blips; processors can redact or sample spans in one place instead of in every app; the same telemetry can fan out to more than one backend; and credentials plus routing live in one config, so swapping or adding a destination never touches the emitting code. I should mention that this is only my opinion and if you are evaluating at scale, having an Otel Collector in front of your observability platform is just common sense.
2. **Directly.** The emitter posts OTLP straight to Galileo's trace-ingest endpoint with the API key, project, and log-stream as headers.

> **Takeaway:** the collector is the right answer for org-wide rollout. For proving an integration, go direct and remove the middleman. Add the collector back when you're shipping to a fleet

## War story 3: the first score is a lie (everything is 1.0)

I'm skipping the Galileo setup to integrate your LLM to be used as a judge and refer you to their documentation.

I wired up the judge, an Anthropic model grading each turn, enabled Galileo's built-in `Tool Selection Quality` metric on the log stream, and sent a session where I'd _deliberately_ made bad tool choices: web-searching for something local, using a listing command to find function callers. 

Every single turn scored a perfect **1.0**.

![A Claude Code session scored by Tool Selection Quality where every turn shows "true" for a perfect 1.0, even though the agent web-searched for local git state and used Read to try to delete a file. Without the tool catalog on the span, the judge sees no alternatives and passes everything.](https://dhbtuus86mod.cloudfront.net/Shot2_the%20false1_0_without-catalog.png)

This is the most important gotcha in the whole project, so it's worth stating plainly that:

**A judge can only assess whether the _right_ tool was chosen if it knows what tools were _available_ and their purpose.** Think about it from the judge's seat. If the only tool it can see is the one that was called, then the agent "correctly" selected from a menu of one, every time. To flag "you should have used Grep instead of WebSearch," the judge has to know Grep was on the menu.

And here is the trap: a bare OpenTelemetry GenAI trace **doesn't carry the available-tool catalog.** It records the tool that was _called_, not the set the agent could have chosen from. So the judge has no alternatives to compare against, and everything passes.

> **Takeaway:** an agent trace is unscoreable for _tool choice_ until it carries the agent's tool catalog. Without it, "Tool Selection Quality" silently degrades to "did you call a tool that exists," which is always a yes.

## War story 4: teaching the trace its tool catalog

So the fix is: publish Claude Code's full tool catalog (Read, Edit, Write, Bash, Grep, Glob, WebSearch, WebFetch, Task, and friends) onto the trace, as _definitions_, so the judge sees the whole menu. Enchilada comes to mind...

The wrinkle I ran into: my plain GenAI spans kept landing in Galileo without a tool catalog, no matter which standard attributes I tried. What I observed is that the available tools list only populated when the incoming trace spoke the convention of an agent framework the platform recognizes, the way traces from the popular agent SDKs and instrumentation libraries do.

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

**Where does the catalog come from?** I started with a static, hand-curated list of the core tools. Good enough to prove the mechanism, and the curated descriptions are an asset. But a real session's menu varies: MCP servers add tools, and we must remember that a hardcoded list drifts as the product evolves. 

The fix is a hybrid, and it falls out of a design choice I'll cover in full later on: sending is **opt-in**. Rather than a background hook that fires automatically when a session ends, sending is a command you deliberately run from inside the live session (transcripts hold your code and prompts, so I wanted a human in the loop, more on that below). That choice pays an unexpected dividend here. Because the command runs while the session is still alive, **the agent itself can hand over its own menu.** When you invoke the send command, the model dumps the tool catalog it actually has right now, MCP tools included, with descriptions drawn from its own tool definitions, and the emitter merges that on top of the curated baseline (baseline wins on collisions, so the judge-tuned descriptions stay). The first live dump I captured reported 42 tools against my 10-tool baseline, so the static-only judge had been blind to roughly three quarters of the real menu. Sessions sent retroactively, where no live dump exists, fall back to the baseline alone.

> **Takeaway:** you don't have to adopt an agent framework to be evaluable, but you do have to _speak the schema_ of one that the platform recognizes. Match a known convention and the platform does the rest. And for the catalog itself, the most truthful source is the agent, live, at send time. One more argument for human-in-the-loop sending over fire-and-forget hooks.

## War story 5: the judge grades the _output_, so the tool call has to be in it

I re-sent the bad-choices session, fully expecting vindication.

Every turn scored **`false`**, including a turn where the agent had done the obviously _correct_ thing (using Read to show a file).

That's a different failure, and it's a good one to understand. The judge assesses tool selection by reading the model's **output** for that turn, the thing the model _produced_. But my emitter had split the work: the assistant's reasoning text went on the chat span, while the actual tool call went on a _separate_ execution span. So the judge looked at the model's output, saw prose but no tool call, and concluded "tools were available and the model failed to call one". Wrong, for everything.

The fix was small: render the chosen tool call **into the chat span's output**, right alongside the reasoning, so "the model selected `Read(file_path=…)`" is visible where the judge is actually looking.

> **Takeaway:** for tool-selection scoring, the model span needs _both_ the available tools _and_ the chosen call, in its output. Available menu plus what-you-picked. One without the other doesn't score.

## The payoff: it catches misses

With the catalog on the span and the tool call in the output, I sent a session with three blatant mistakes and one correct choice. The result:

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

Compare that to where we started, a meaningless 1.0, and the entire thesis of the project is in the diff: **bare telemetry can't grade tool choice; a trace that carries its tool catalog can.**

## War story 6: my fixtures flattered me

Feeling good, I pointed the whole thing at a _real_ session, my own from earlier that day, a rambling repo-setup conversation. The result was a wall of red. Most turns scored false, including tool choices that were obviously fine.

I'd built a demo that only worked on demo input. Look at what my fixture prompts had in common: "Show me the contents of src/server.py." "What git branch is this repo on?" "How many Python files are in src/?" Every one is **self-contained**, a complete question you can grade in isolation. Real sessions are nothing like that. Real sessions are full of "yes do", "let's do option A", "#1", "leave it be". Half of what you say to a coding agent only means something in the context of what came before.

And my emitter was throwing that context away. Each turn became its own trace whose input was _only that turn's user message_. So the judge was being handed "yes do" with no history and asked whether the tool choice was correct. That's unanswerable, and an honest judge says so, which comes out as false. The most damning example: I'd said `do #1`, the agent ran a shell command, and confirmed it had removed a redundant clone, a perfectly good move, scored false purely because the judge couldn't see that "#1" referred to "delete the empty repo."

The fix is conceptually obvious once you see it: put the **conversation so far** on each turn's input, not just the latest message. A compact rolling transcript of the prior turns, clearly delimited from the current ask, so the judge can resolve the reference before grading the choice. About forty lines.

Re-scored, the context-dependent turns came back to life. The judge's own explanation on the "yes do" turn now reads:

> "'yes do' … is a direct affirmation to a previously asked question. Looking at the chat history, the assistant had just asked: 'Want me to: A) Add an [includeIf …] block … B) …'"

It resolves the reference through the history, _then_ grades the tool choice. The remaining failures became real, defensible judgments instead of shrugs.

I want to be honest that this is a hack, not a finished design. Stuffing a text transcript into every turn's input re-sends the whole history on each turn (token cost climbs with conversation length), it's a flat blob rather than a structured multi-turn exchange, and a fixed character budget can truncate the very earlier turn that mattered. Scalable versions exist, and they're the right long-term shape: emit the turns as a **structured, role-tagged message sequence** so the platform treats it as a real conversation; **score at the session level** with native access to prior turns rather than duplicating context into every trace; or **summarize / retrieve** only the earlier turns a given turn actually references instead of a blind window. Those are for another day. The lesson that generalizes is the cheap one:

> **Self-contained eval fixtures flatter you.** The hard part of evaluating an agent is exactly the multi-turn context that toy inputs don't have. Test on a real trajectory early, before you convince yourself it works.

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

The tempting design is "fire it automatically when the session ends." I looked hard at doing that with an end-of-session hook and decided against it, for two reasons.

First, a mechanical one: end-of-session hooks are fire-and-forget. They can't pause, can't prompt, and can't be _cancelled_. There's no clean way to ask "do you actually want to send this one?" at the moment it matters.

Second, and more importantly: **transcripts contain your code, your prompts, and your command output.** Auto-shipping every session off the machine, silently, is exactly the behavior a security-conscious team should be nervous about.

So sending is a **deliberate, human-in-the-loop action**: a single command you run when _you_ decide this session is worth logging. It finds the current session's transcript, sanitizes it, and sends it. Nothing leaves your machine until you say so.

<!-- TODO screenshot 5 (optional): the terminal moment of invoking the manual "send this
session" command and its confirmation output (which session was sent, to which
project/log stream). Reinforces the "nothing auto-exfiltrated" story. -->

> **Takeaway:** for anything that ships developer sessions somewhere, opt-in beats automatic. It's a better privacy posture _and_ a better story to tell your security team.

## What I'd tell you before you start

- **Metrics ≠ traces.** Built-in usage telemetry can't be scored. Reconstruct the trace from the transcript.
- **Sessions are free if you use the standard attribute.** `gen_ai.conversation.id` folds turns into one Session automatically.
- **A trace is unscoreable for tool choice until it carries the tool catalog.** The _available_ tools, not just the called one, in a format the platform recognizes.
- **The judge reads the model's output.** Put the chosen tool call there, next to the reasoning, or it can't grade the choice.
- **Judge scores are noisy.** Pick a judge with strong structured output, sample more than once, and expect the occasional retry.
- **Opt-in, always.** Developer transcripts are sensitive; make sending a deliberate act.

The end state is genuinely useful: a real Claude Code session, rendered as an agent trace, scored turn-by-turn on whether it reached for the right tool, with the judge correctly flagging the moves that a good engineer would have made differently. That's not a dashboard. That's evaluation.

## The wrinkles I'm saving for Part II (and III)

Working end-to-end is not the same as finished. Three threads are deliberately left hanging, and each is meaty enough to be its own post.

**Sessions that outlive themselves, and sends that don't replace.** Two related problems, both about identity. First, re-sending is not idempotent: my emitter lets fresh span ids get generated on every run, so sending the same session twice _piles up_ duplicate turns instead of updating in place. The clean fix is to derive deterministic ids from the session and turn, so a re-send overwrites rather than accumulates. Second, Claude Code lets you _continue_ or _resume_ a conversation, and the resumed session gets a **new session id** for what is logically the same thread, which shows up as a _separate_ Session unless you chain it to its predecessor, and, sneakier, a resumed transcript _contains the earlier turns_, so re-sending it duplicates history under a new id. Galileo has a session-chaining concept ("this session continues that one"); wiring both deterministic ids and continuation detection into the send path is Part II material.

**Point-in-time catalog fidelity.** The hybrid catalog is truthful for the session you're in, and retroactive sends fall back to the baseline. But the deeper version of this problem, _what exactly was on the menu at the moment of each historical turn_, needs the catalog captured at session time, not send time. Think of it as snapshotting the menu alongside the meal.

**From one machine to a fleet.** Everything here is one developer, one machine, direct to one Galileo instance. The org-wide version, with the OpenTelemetry Collector as a central gateway, credentials out of the developer's hands, managed rollout, and tool-selection scores _aggregated across a team_, is where this stops being a demo and starts being an adoption-depth instrument. That's Part III.

<!-- TODO: add the companion repo link once published (the emitter, the manual send
command, and the example sessions). Draft footer line:
"Want the companion repo? <link>" -->
