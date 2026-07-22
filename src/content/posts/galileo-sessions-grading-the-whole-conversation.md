---
title: "Galileo Sessions: Grading the Whole Conversation"
datePublished: 2026-07-29T12:00:00.000Z
slug: galileo-sessions-grading-the-whole-conversation
cover: https://dhbtuus86mod.cloudfront.net/ai-agent-trajectory-illustration.png
---

*Part 2 of a series on evaluating agents with Galileo*

Part 1, [Evaluating an AI Agent Is a Trajectory Problem](/posts/evaluating-agents-is-a-trajectory-problem), argued that you have to grade an agent's journey, not just its final answer. This post is about the Galileo feature that makes that possible, and the sharp edges I hit using it.

In [Part 1](/posts/evaluating-agents-is-a-trajectory-problem) I made a claim and left it hanging: evaluating an agent means evaluating a whole trajectory, in context, as one connected thing, and that puts a specific demand on your tooling. This post is about the piece of Galileo that meets that demand, **Sessions**, and about the things that only became obvious once I tried to grade real conversations with it.

A Session, in Galileo's terms, groups the related traces, spans, and events of a single interaction into one native record. For my use case that interaction is a multi-turn conversation, so throughout this post that is the lens I'll use: a Session is the whole conversation, with every turn grouped underneath it, rather than a scattering of unrelated traces that happen to share some metadata. That one change, turns-belong-to-a-conversation instead of turns-float-free, is what lets a scorer grade a turn *inside* the trajectory it came from. And as I'll get to, that context is not a nicety. For a lot of turns it's the difference between a gradeable decision and an unanswerable one.

To keep this concrete I used a coding agent as the source of real trajectories, for all the reasons laid out in Part 1. The full transcript of every session it runs is already on disk, so I have a supply of genuine multi-turn conversations to feed in. Let me start with how one of those transcripts becomes a Session.

## First, a reconstruction problem

The obvious move is to flip on the agent's built-in telemetry and point it at Galileo. That does not get you what you need. Built-in telemetry tends to emit **usage metrics**: counters and gauges for tokens, cost, turn counts. Those are numbers, and there is nothing in a number for a judge to read. No per-turn structure, no tool calls with their inputs and outputs, no conversation. You cannot grade a counter.

To evaluate the agent you have to **reconstruct the trajectory yourself** from the session transcript: the turn-by-turn record of what the user said, what the model decided, which tools it called, and what came back. A small emitter walks the transcript and turns each user turn into a span tree that mirrors the agent's actual structure:

```
invoke_agent  "coding-agent"          (one trace per user turn)
  ├── chat           (what the model decided this turn)
  ├── execute_tool   (a tool call, with its arguments and result)
  └── execute_tool   (...)
```

That gives you a trace per turn. On its own, though, a stack of per-turn traces is exactly the "scattering that happens to share metadata" I said Sessions was supposed to save us from. The turns need to be pulled together into one conversation.

## Turning turns into a Session

This is the part that just works, and it's worth appreciating precisely because so little of the rest of this post does. Galileo resolves a Session from any of a few span attributes, checking `session.id` first, then the GenAI-standard `gen_ai.conversation.id`, then a couple of others. I reached for `gen_ai.conversation.id` because it's the OpenTelemetry semantic-convention attribute for "these spans belong to the same conversation," so my spans stay portable. Tag every span for a session with the same conversation id, and Galileo folds all of those turns into a single native Session, keyed by that id. No custom grouping logic, no post-processing job. Emit the attribute and the Session assembles itself.

![The Galileo view of one Session expanded to show its child traces: every turn of the coding-agent conversation folded under a single Session via the gen_ai.conversation.id attribute, with each turn's invoke_agent, chat, and tool spans nested beneath it.](https://dhbtuus86mod.cloudfront.net/Shot1_session_grouping.png)

So far this reads like a plumbing win: one attribute, automatic grouping, move on. The reason it matters, and the reason a Session is more than a tidy folder for traces, only showed up when I stopped grading toy inputs and graded a real conversation.

## The insight: a turn is meaningless without its trajectory

Here is where I nearly fooled myself.

I built my first test transcripts by hand, with clean, deliberate prompts so I could predict the verdicts. Things like "Show me the contents of src/server.py," "What git branch is this repo on?", "How many Python files are in src/?" I wired up scoring, the results looked sensible, and I felt good about the whole pipeline.

Then I pointed it at a *real* session, one of my own from earlier that day, a rambling, back-and-forth repo-setup conversation. The result was a wall of red. Most turns scored as failures, including decisions that were plainly fine.

I had built something that only worked on the input I built it for. Look at what my handmade prompts had in common: every single one is **self-contained**. Each is a complete question you can read in isolation and grade without knowing anything that came before. Real conversations are nothing like that. Real conversations are full of "yes, do that," "let's go with option A," "number one," "no, leave it." A huge fraction of what a person says to an agent is a *reference*, and it only means something in the light of the turns around it.

And my reconstruction was throwing exactly that away. Each turn became its own trace whose input was *only that turn's user message*. So the judge was being handed "yes, do that," with no history at all, and asked whether the tool the agent chose was the right one. That question is unanswerable in isolation, and an honest judge says as much, which comes out as a failure. The most galling example: I had told the agent "do #1," it ran a shell command and removed a redundant clone, a perfectly good move, and it scored as a failure purely because the judge could not see that "#1" referred to "delete the empty repo" from the previous turn.

Nothing was wrong with the agent, the metric, or the grouping. The problem was that I was grading points when the unit is a trajectory. **This is the whole reason a Session has to be a first-class citizen and not just a grouping key.** A turn is not independently gradeable. Its meaning lives in the conversation, so the conversation has to be present at the moment of grading.

The fix is obvious once you have seen the problem: put the **conversation so far** on each turn's input, not just the latest message. A compact rolling transcript of the earlier turns, clearly separated from the current ask, so the judge can resolve the reference before it grades the decision. That was about forty lines of emitter code.

Re-scored with context attached, the context-dependent turns came back to life. On the "yes, do" turn, the judge's own written explanation now reads:

> "'yes do' ... is a direct affirmation to a previously asked question. Looking at the chat history, the assistant had just asked: 'Want me to: A) Add an [includeIf ...] block ... B) ...'"

It resolves the reference through the history *first*, then grades the decision. The failures that remained were now real, defensible judgments instead of shrugs at an impossible question.

I want to be honest that the forty-line version is a hack, not a finished design, and the honest version of this section says why. Stuffing a text transcript into every turn's input means you re-send the whole history on each turn, so token cost climbs with conversation length. It's a flat blob of text rather than a structured multi-turn exchange. And a fixed character budget can truncate the very earlier turn that mattered. The scalable shapes exist, and they're the right long-term answer:

- Emit the turns as a **structured, role-tagged message sequence** so the platform treats the input as a real conversation instead of a wall of text.
- **Score at the session level**, with the scorer given native access to prior turns, rather than duplicating the context into every single trace.
- **Summarize or retrieve** only the earlier turns a given turn actually refers to, instead of blindly attaching a fixed window of history.

Those are their own project. The cheap, portable lesson is the one worth carrying out of here:

> **Self-contained evaluation fixtures flatter you.** The hard part of evaluating an agent is precisely the multi-turn context that toy inputs don't have. Grade a real trajectory early, before you convince yourself the thing works.

## Sharp edge: sending the same session twice

Once real sessions are flowing, a mundane-sounding question turns out to matter a lot: what happens if you send the same session more than once? You will, constantly, whether re-running after a fix, or re-sending a conversation that grew since last time.

Recall the emitter from earlier, the small script that reconstructs the transcript into spans. Every span it produces carries a unique identifier, and that identifier is what Galileo uses to decide whether an incoming span is a new record or an update to one it already has. My first version generated fresh identifiers on every run. So sending a session a second time did not *update* it, it *piled a second copy on top*. Duplicate turns, duplicated history, one logical conversation smeared across two sets of traces. The grouping key held the Session together, but inside it everything doubled.

The clean fix is to make the identifiers **deterministic**: derive each turn's ids from the session id and the turn itself, so the same turn always produces the same id. Then a re-send overwrites in place instead of accumulating, and sending a session is safely idempotent. It's a small change with an outsized effect on whether your data stays trustworthy over time, and it's the kind of thing you only notice once you're re-sending real conversations rather than one-shot fixtures.

## Sharp edge: sessions that outlive their identity

The second edge is subtler and it comes straight from how agents actually get used: people leave and come back. This is not a coding-agent quirk. It shows up anywhere a conversation can be paused and picked up later. A customer reopens a support chat the next day and continues where they left off. Someone resumes a chat-assistant thread after it timed out. A long-running task agent is checkpointed overnight and restarted in the morning. My coding agent is just the version in front of me: it lets you *continue* or *resume* a session, and when you do, the resumed run is logically the same thread but it's commonly handed a **new session id**.

Two things fall out of that, and both bite:

- **The resumed thread shows up as a separate Session.** Same conversation in every human sense, two distinct Session records in Galileo, unless you tell the platform that one continues the other. Galileo can do that: it has a "this session continues that one" link. The catch is that, as far as I could find, you set it through the session API, not on a span. My emitter only sends spans, so it can't request the link at all. Someone would have to detect the continuation and make a separate API call to wire it up. So no, it doesn't happen for free.
- **A resumed transcript contains the earlier turns.** So if you naively re-send it, you duplicate all of that history under a brand-new identity, which is the previous sharp edge wearing a disguise.

Detecting continuations and chaining them, rather than letting a long-lived conversation fragment into a pile of disconnected Sessions, is real work. I'm deliberately flagging it here rather than pretending it's solved, because "the identity of a conversation over time" is exactly the sort of nuance that only surfaces once you take trajectories, and Sessions, seriously.

## Where this leaves us

Sessions are what turn a heap of per-turn traces into an evaluable trajectory, and that is a bigger deal than the one-attribute setup makes it look. The grouping is trivial. The consequences are not: a turn can't be judged without the conversation around it, re-sends have to be idempotent or your data rots, and a conversation's identity can outlive the id it was born with.

What I have not done yet in this series is grade the decisions themselves with any real rigor. I've leaned on a judge to show that context matters, but I haven't picked a concrete agentic metric and pushed on what it actually takes to make an automated judge grade *well* rather than wave everything through. That turns out to be its own tangle of war stories, and it's where the next part goes.

---

**Next in the series:** [Part 3, Scoring Your Coding Agent's Tool Choices](/posts/scoring-your-coding-agents-tool-choices-with-galileo), where I pick one agentic metric and push on what it takes to make an automated judge grade a decision well.
