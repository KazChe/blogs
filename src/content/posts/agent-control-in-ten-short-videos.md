---
title: "Agent Control - in ten short videos"
datePublished: 2026-09-29T12:00:00.000Z
cover: https://dhbtuus86mod.cloudfront.net/control-agent-eval-cover.jpg
seoTitle: "Agent Control basics"
seoDescription: "What an open-source control plane for AI agents does, in ten narrated episodes. Why the rule lives outside the agent, what a control is, how a request flows, evaluators, actions, evidence, custom and model-backed evaluators, and controls as code."
tags: agent-control, ai-guardrails, control-plane, evaluation
---

The last few posts here put a model at the evaluator's decision point in Agent Control and measured what it did. They assumed you already knew what Agent Control is, what a control is, and what "the data plane" means when I say it. That was a lot to assume. This post is the ground under those posts.

I recorded ten short episodes, two to four minutes each. About forty minutes in all. Each one is embedded below. They build on each other, so watch them in order the first time.

One limit up front. The episodes show one product at one version. Everything on screen was recorded against [Agent Control](https://github.com/agentcontrol/agent-control) 8.8.0.

## The words

Four terms carry the whole series. Here they are, so the videos can move fast.

**Data plane and control plane.** Below, the agents doing the work, calling models and tools. That is the data plane. Above it, a layer that decides before the work happens and records after it does. That is the control plane. Agent Control is an open-source control plane for AI agents, and one decorator on the function that makes the call is the whole integration.

**A control.** Every control is three parts, nothing more. Scope is when, and on which step. Condition is what to check and how. Action is what to do when the condition matches.

**An evaluator.** A condition pairs a selector, which picks a piece of the step, with an evaluator, which judges that piece. Every evaluator answers the same way. Matched, true or false. A confidence between zero and one. A message saying why. And metadata for the audit trail. Regex, list, JSON, SQL, a model, or something you wrote yourself, the plane cannot tell them apart. That evaluator is the decision point the later posts are about.

**The three actions.** Observe records the match and lets the request through. Deny stops it. Steer stops it too, but hands the agent a message about what to fix so it can try again. When several controls match at once, deny wins.

## 1. Why a control plane

<video src="https://dhbtuus86mod.cloudfront.net/ace-episodes/ep01-why-control-plane.mp4" controls preload="metadata" playsinline style="width:100%"></video>

_<a href="https://dhbtuus86mod.cloudfront.net/ace-episodes/ep01-why-control-plane.mp4" target="_blank" rel="noopener">Why a control plane</a>, two minutes. Concepts only._

A support assistant reads a customer's social security number back, and nothing stops it. The obvious fix is a check inside the agent. Then the coding agent needs one, then billing, and the same rule lives in three codebases, written three ways, with three deploys every time it changes. Nothing records why a request was refused. The episode lifts the checks out of the agents into one place they ask before they act. The rule is written once, in configuration, so changing it is an edit, not a release. Then it shows the same agent twice. With no control configured, the number leaks. With one control on the server, the reply is blocked and the code never moved.

## 2. The anatomy of a control

<video src="https://dhbtuus86mod.cloudfront.net/ace-episodes/ep02-anatomy-of-a-control.mp4" controls preload="metadata" playsinline style="width:100%"></video>

_<a href="https://dhbtuus86mod.cloudfront.net/ace-episodes/ep02-anatomy-of-a-control.mp4" target="_blank" rel="noopener">The anatomy of a control</a>, three minutes._

The control from episode 1, read as three answers to three questions. Scope names the step type, model or tool, optionally the step name, and the stage. Pre means before the step runs, and a deny there means the function never runs. Post means after, and a deny holds the output back. A condition is a selector plus an evaluator, and the evaluators in the box are a regular expression, a list of values, a JSON schema, a SQL check, or one you write. Conditions compose with and, or, and not, and not is how you write an exemption. The episode runs a two-branch control with two probes so you can see one branch match and the control stay quiet. Then the three actions, and the rule that deny wins over everything else.

## 3. The request flow

<video src="https://dhbtuus86mod.cloudfront.net/ace-episodes/ep03-request-flow.mp4" controls preload="metadata" playsinline style="width:100%"></video>

_<a href="https://dhbtuus86mod.cloudfront.net/ace-episodes/ep03-request-flow.mp4" target="_blank" rel="noopener">The request flow</a>, three minutes. Concepts and SDK behavior._

Two lanes, the agent's process and the server. Traffic crosses at startup, when the agent registers and fetches its controls, and on every decorated call, before it runs and after. Two round trips per call, and the agent's code knows about neither. Each control says where its evaluator runs. Server is the default. SDK moves the judging into the agent's process, for an evaluator that needs a credential, a local model, or a package you wrote. The control itself stays on the server either way. When the plane cannot judge a call, it does not guess. It blocks. There are three timeouts in layers, ten seconds per evaluator, thirty on the server, thirty on the SDK's connection, and you keep all three shorter than what your agent can afford to wait. The last arrow is the refresh. Controls are fetched at startup and refreshed on an interval, so a policy change needs no restart and no deploy.

## 4. What a control can see

<video src="https://dhbtuus86mod.cloudfront.net/ace-episodes/ep04-what-a-control-can-see.mp4" controls preload="metadata" playsinline style="width:100%"></video>

_<a href="https://dhbtuus86mod.cloudfront.net/ace-episodes/ep04-what-a-control-can-see.mp4" target="_blank" rel="noopener">What a control can see</a>, three minutes._

A control looks at one thing, the step. A type, a name, an input, an output once the function has run, and an optional context. A selector can only reach what is in it. A plain decorated function becomes a model step. A function carrying a name attribute becomes a tool step, which is why framework tool wrappers from LangChain, Google ADK, or CrewAI go on the inside and the Agent Control decorator on the outside. Then the part that matters. For a model step the SDK picks one string out of your arguments and drops everything else. For a tool step the input is the whole argument dictionary. The trap is a supervisor exemption that works on a tool step and silently does nothing on a model step, because the list evaluator gets an empty value and answers "empty input, control ignored" while the control sits enabled and green. The fix is to call the evaluation yourself and pass a context object, which is also how you hand a model-backed evaluator the whole conversation.

## 5. Evaluators

<video src="https://dhbtuus86mod.cloudfront.net/ace-episodes/ep05-evaluators.mp4" controls preload="metadata" playsinline style="width:100%"></video>

_<a href="https://dhbtuus86mod.cloudfront.net/ace-episodes/ep05-evaluators.mp4" target="_blank" rel="noopener">Evaluators</a>, four minutes._

The contract, then the four built-ins. They are deterministic, so their confidence is always one. Regex runs on a linear-time engine, and ignore case is its only flag. List has exact, contains, starts with, and ends with, and a match-on switch that fires when none of the values are present, which turns a blocklist into an allowlist. Then the polarity flips. Regex and list match when something is found. JSON and SQL match when a rule is broken, so a schema describes what is allowed and the evaluator matches on the violation. The SQL evaluator parses the statement in the dialect you name and checks operations, tables, limits, and join counts. Two things about running them. The server keeps one instance per evaluator name and configuration and reuses it, so an evaluator must not keep per-request state. And each declares a timeout, ten seconds by default, fifteen for JSON. Model-backed evaluators arrive as add-on packages through the same plug-in mechanism.

## 6. Actions, and the steer loop

<video src="https://dhbtuus86mod.cloudfront.net/ace-episodes/ep06-actions.mp4" controls preload="metadata" playsinline style="width:100%"></video>

_<a href="https://dhbtuus86mod.cloudfront.net/ace-episodes/ep06-actions.mp4" target="_blank" rel="noopener">Actions, and the steer loop</a>, four minutes._

One tool, a wire transfer, with three controls on it, observe, deny, and steer. Three transfers. Five hundred dollars to a new recipient completes, and the observe match shows up only on the server. Five thousand to a sanctioned country is denied, and the reason printed is the evaluator's own message. Fifteen thousand without verification is steered. The SDK raises a steer error with the steering context inside, the agent verifies, retries, and the retry goes through every control again, six spans in the trace. Two things to be clear about. The platform defines the steering context as one string, and the JSON structure inside it is a convention between whoever writes the policy and whoever writes the agent. And the agent caps its retries. The last part shows steer inside Google ADK, AWS Strands, and LangChain or LangGraph, where there is no plugin and the tool catches the exception itself. The habit is to ship a new control as observe first, read what it would have done, then flip it to deny or steer.

## 7. Evidence

<video src="https://dhbtuus86mod.cloudfront.net/ace-episodes/ep07-evidence.mp4" controls preload="metadata" playsinline style="width:100%"></video>

_<a href="https://dhbtuus86mod.cloudfront.net/ace-episodes/ep07-evidence.mp4" target="_blank" rel="noopener">Evidence</a>, three minutes._

The auditor's question is "show me." Every control evaluation is a span inside the trace of the run that triggered it, not a separate log, in the same trace store the team already uses, which here is Galileo. A control span records the name, the stage, the step type, the evaluator and selector path, the input it actually saw, the action, matched, confidence, and any error. The episode opens the transfer that completed with nothing to show in the terminal and finds three control spans anyway. Non-matches are evidence too. The sanctions span on that transfer says evaluated, did not match, so "was it checked" is answered by a record rather than inferred from the absence of a block. The steered transfer shows the retry was judged again by every control. The habit is that span order inside a trace is not guaranteed, so read spans by name and result, never by position. Enforcement without evidence is not governance.

## 8. Custom evaluators

<video src="https://dhbtuus86mod.cloudfront.net/ace-episodes/ep08-custom-evaluators.mp4" controls preload="metadata" playsinline style="width:100%"></video>

_<a href="https://dhbtuus86mod.cloudfront.net/ace-episodes/ep08-custom-evaluators.mp4" target="_blank" rel="noopener">Custom evaluators</a>, four minutes._

When a pattern is not enough. The data lives somewhere else, the judgment does not depend on the data at all, it needs meaning from a specific provider, or it depends on history. The interface is five parts. A config class, an evaluate method, metadata with a name, a register decorator, and an entry point in the agent control evaluators group so the SDK finds the package at startup. Two things to keep. The metadata name is the real identifier and the entry point key is only a label, so keep them identical. And instances are cached and shared across requests, so the evaluator keeps no state of its own. The control names the evaluator by string, exactly like a built-in, and the console shows it the same way. SDK controls run first, in your process, and a local deny means the server is never asked. Then the trap. Uninstall the package and the verbose reply goes straight through. The SDK logs one warning and falls back to the server, where an SDK control never runs. Fail open, and nothing in the output says so. The lesson is a deployment decision. SDK execution when the code or the data must stay in the agent's process. Server execution when the control must not be bypassable.

## 9. Controls as code

<video src="https://dhbtuus86mod.cloudfront.net/ace-episodes/ep09-controls-as-code.mp4" controls preload="metadata" playsinline style="width:100%"></video>

_<a href="https://dhbtuus86mod.cloudfront.net/ace-episodes/ep09-controls-as-code.mp4" target="_blank" rel="noopener">Controls as code</a>, three minutes._

The console form and a script dictionary create exactly the same object on the server, which is what makes controls automatable. A definition can live in a repo, go through review, and be applied by a pipeline. The setup script bundles three operations that production keeps apart. Register the agent, create the control, attach it. Attaching to an agent makes policy follow the application. Binding to a log stream makes it follow the environment. The create-or-update pattern makes the script safe to run on every merge. Try to create, and on a conflict look the control up by name and write the new definition onto the same identifier. The episode changes one word in a condition, and to or, reruns the setup, and exactly one probe flips from allowed to blocked with nothing in the agent changed. Traces already written do not change either, because each one records the definition that was live at the time. The API surface is listed at the end, including validate, which checks a definition without saving it, and versions.

## 10. A model-backed evaluator

<video src="https://dhbtuus86mod.cloudfront.net/ace-episodes/ep10-model-backed-evaluator.mp4" controls preload="metadata" playsinline style="width:100%"></video>

_<a href="https://dhbtuus86mod.cloudfront.net/ace-episodes/ep10-model-backed-evaluator.mp4" target="_blank" rel="noopener">A model-backed evaluator</a>, four minutes._

Rules judge the shape of the data in front of them, and shape is not meaning. Luna is Galileo's family of small language model scorers, and the connector makes any Luna scorer a control condition. The config names a scorer, a threshold, an operator, and a payload field. Toxicity is higher-is-worse, so the control matches at or above the threshold. Adherence scorers run the other way. Execution is server, and here that is not a choice, because the credentials live on the Agent Control server and the agent needs only its workspace key. A polite reply is allowed and a rude one is blocked, and the span carries the real confidence, which is the first time in the series that number means anything. Two traps. The wrong payload side handed the scorer an empty field, it scored the rude reply at four percent and allowed it, and nothing looked wrong. The wrong operator blocks polite replies and passes rude ones just as quietly. The habit is the same as episode 6. Ship it as observe first, read the scores in the spans, then promote it with the evidence in hand. Timeouts fail visible, and a deny control that cannot be evaluated blocks.

## Two references

The [examples](https://github.com/agentcontrol/agent-control/tree/main/examples) in the Agent Control repository, including the steer loop as a LangGraph graph from episode 6, and the [documentation](https://docs.agentcontrol.dev), which the episodes cite for every definition.

## Where this goes next

Episode 10 puts a scorer at the evaluator's decision point and compares it to a threshold. The posts that sent me back to record this series put a model that answers typed questions there instead, and measured it. [Your guardrails are just untested classifiers](https://untounium.dev/posts/your-guardrails-are-just-untested-classifiers) sets up the test. [The self-policing Noul](https://untounium.dev/posts/the-self-policing-noul) runs it. [Not Yet, Ask Them This](https://untounium.dev/posts/a-typed-judgment-where-the-plane-only-had-a-score) puts the model in front of a support agent's tools. [One Call, Three Controls](https://untounium.dev/posts/a-jev-evaluator-for-agent-control) is the build. A primer on TypeSafe and Jev, the model those posts use, is a separate post to come.
