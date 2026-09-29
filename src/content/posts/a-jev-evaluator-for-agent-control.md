---
title: "One Call, Three Controls"
datePublished: 2026-09-30T12:00:00.000Z
cover: https://dhbtuus86mod.cloudfront.net/01-hero-one-call-three-controls.png
seoTitle: "A custom Agent Control evaluator, end to end"
seoDescription: "How to put a model inside an Agent Control control as a custom evaluator, with TypeSafe's Jev as the worked example. The package, the contract, the entry point, the config, one Jev call shared by three controls, how steer reaches the agent, sdk versus server execution, offline tests with a fake client, and what lands in the audit events. Pinned to agent-control-sdk 8.8.0 and typesafe-sdk 0.7.1."
tags: untested-classifiers, typesafe, jev, agent-control, evaluation
---

_Continues the series on guardrails as untested classifiers. This one is the build._

The [previous post](https://untounium.dev/posts/a-typed-judgment-where-the-plane-only-had-a-score) argued that the evaluator's decision point in Agent Control can hold a model that answers questions, not just one that returns a score, and reported what happened on forty conversations. This post is how that evaluator was built, in the order you would build your own.

It assumes you have an [Agent Control](https://github.com/agentcontrol/agent-control) server running and a TypeSafe API key. Everything is pinned. `agent-control-sdk`, `agent-control-evaluators`, and `agent-control-models` at 8.8.0, `typesafe-sdk` at 0.7.1, the model `jev-1.13.0`. Several paragraphs below describe what the SDK does by reading its source, because the behavior matters and the docs do not cover it. That source is not a published interface. When 8.8.0 stops being the pin, those paragraphs need re-checking.

## What Agent Control asks of an evaluator

An evaluator is a Python class, and because this one runs inside the agent's process, this class is the whole contract between your code and the plane. The server never sees the code. It sees a control definition that names the evaluator by string, and the SDK running next to your agent holds the class to what follows. The contract is in `agent_control_evaluators/_base.py`, and condensed it is this.

```python
class Evaluator(ABC, Generic[ConfigT]):
    metadata: ClassVar[EvaluatorMetadata]      # name, version, description, requires_api_key, timeout_ms
    config_model: ClassVar[type[EvaluatorConfig]]

    def __init__(self, config: ConfigT) -> None:
        self.config = config

    @abstractmethod
    async def evaluate(self, data: Any) -> EvaluatorResult: ...

    async def evaluate_with_context(self, data: Any, step: Step) -> EvaluatorResult:
        return await self.evaluate(data)
```

Two class variables, a constructor that keeps the validated config, one required method, and one optional method. `evaluate` receives whatever the control's selector picked out of the step. `evaluate_with_context` receives that plus the whole step, and it is the one the engine calls. The default just forwards to `evaluate`, so an evaluator that only needs the selected data implements one method and an evaluator that needs the rest of the step overrides the other.

The return value is an `EvaluatorResult` with five fields. `matched`, a boolean. `confidence`, a float between zero and one, required. `message`, `metadata`, and `error`, all optional. A validator enforces one rule, that `matched` is false whenever `error` is set.

The base class docstring carries the constraint that shapes everything else. Instances are cached and reused across requests, so "DO NOT store mutable request-scoped state on `self`". Anything you keep on the instance has to be immutable or thread safe. Keep that in mind for the memo later.

## The package

The evaluator lives in its own package inside the repo, `packages/agent-control-evaluator-jev-gate`, with five modules under `src/agent_control_evaluator_jev_gate`. `config.py`, `questions.py`, `policy.py`, `evaluator.py`, and `__init__.py`. The repo is a uv workspace, so there is no `pip install -e`. One command installs the package, the runner, and the dev tools.

```bash
uv sync --all-packages --group dev
cp .env.example .env        # TYPESAFE_API_KEY, AGENT_CONTROL_URL
uv run pytest -q            # offline, Jev and the server are faked
docker compose up -d        # in the agent-control checkout, for a local server
```

The package declares its pins and one entry point.

```toml
dependencies = [
    "agent-control-evaluators==8.8.0",
    "agent-control-models==8.8.0",
    "typesafe-sdk==0.7.1",
]

[project.entry-points."agent_control.evaluators"]
"typesafe.gate" = "agent_control_evaluator_jev_gate.evaluator:JevGateEvaluator"
```

The entry point is how the SDK finds the class at startup without anyone importing it. Discovery iterates the `agent_control.evaluators` group, loads each class, and registers it once per process. Two details from `_discovery.py` are worth knowing. The registry key is `evaluator_class.metadata.name`, not the entry point key. The string on the left of the `=` above is a label, and if it ever disagreed with the metadata name, controls would have to reference the metadata name. Keep them identical. And a class whose `is_available()` returns false is skipped with a debug log, while a class that fails to import is skipped with a warning. Neither stops the process.

Why the package has to be installed next to the agent, and not on the server, follows from what the SDK does at startup. `agent_control.init` registers the agent and fetches its controls from the server, the rendered, enabled set bound to that agent, through `GET /api/v1/agents/{name}/controls`. It keeps that list in memory, refreshes it on a background thread every sixty seconds by default, and hands it to every evaluation. That is the policy sync. The definitions come from the server and can change without a deploy. But a control in that list marked `execution: "sdk"` names an evaluator by string, and the SDK has to turn that string into a class in the process it is running in. The entry point and the install are what make that lookup succeed. The server stores and distributes the definition and never needs the code. So the agent's environment needs three things installed, the SDK, this package, and the TypeSafe client it imports, and the server needs none of them.

## Config, and why the key is not in it

```python
class GateConfig(EvaluatorConfig):
    """The API key is read from TYPESAFE_API_KEY where evaluation runs, never from config."""

    model_config = ConfigDict(**{**EvaluatorConfig.model_config, "extra": "forbid"})

    decision: Literal["deny", "steer", "observe"] = Field(
        description="The action this control represents; matched when the policy chose it"
    )
    model: str = Field(PINNED_MODEL, description="Jev model id; pin a version")
    timeout_ms: int = Field(10000, ge=1000, le=60000)
    memo_ttl_seconds: float = Field(10.0, ge=0.0, le=300.0)
```

`EvaluatorConfig` is an empty pydantic model, so the config is whatever you add. One field is required, `decision`, the action this control represents. The other three have defaults, and `extra="forbid"` rejects a typo in a control definition instead of ignoring it.

The docstring is the important line. The config is not a private place. It is part of the control definition stored on the server, and it is part of the instance cache key. In `_factory.py` the key is the evaluator name plus a JSON dump of the config with sorted keys, in an LRU of one hundred entries. A secret in config would be a secret in two places it does not belong. The key comes from the environment of the process where evaluation runs, and nowhere else.

`timeout_ms` is what `get_timeout_seconds()` reads, falling back to the metadata default when the config has no such field.

## The evaluator

The class head does four things. Registers, names itself, builds a client, and routes both entry points to one implementation.

```python
@register_evaluator
class JevGateEvaluator(Evaluator[GateConfig]):
    metadata = EvaluatorMetadata(
        name="typesafe.gate", version="0.1.0",
        description="...", requires_api_key=True, timeout_ms=10000,
    )
    config_model = GateConfig

    def __init__(self, config: GateConfig, client: Any = None) -> None:
        super().__init__(config)
        self._client = client
        self._client_error: str | None = None
        if client is None:
            self._client, self._client_error = _make_client(config)

    @classmethod
    def is_available(cls) -> bool:
        return importlib.util.find_spec("typesafe_sdk") is not None

    async def evaluate(self, data: Any) -> EvaluatorResult:
        return await self._evaluate(data, None)

    async def evaluate_with_context(self, data: Any, step: Any) -> EvaluatorResult:
        return await self._evaluate(data, step)
```

`_make_client` reads `TYPESAFE_API_KEY` and builds one `AsyncTypeSafeClient` per cached instance. If the key is missing it returns an error string instead, and every evaluation from that instance returns a result with that error. The `client` argument exists for the tests. `requires_api_key=True` in the metadata is informational. Nothing in the 8.8.0 SDK reads it, so the missing-key check is the evaluator's own.

The evaluator needs three things from the step. The tool name, the arguments, and the conversation so far. The controls use selector path `*`, which hands the evaluator the whole step as a dict, and the engine also passes the `Step` model, so the extractor accepts either.

```python
def extract_call(data, step=None):
    src = step if step is not None else data
    name = getattr(src, "name", None) if not isinstance(src, dict) else src.get("name")
    inp = getattr(src, "input", None) if not isinstance(src, dict) else src.get("input")
    ctx = getattr(src, "context", None) if not isinstance(src, dict) else src.get("context")
    ...
    conversation = (ctx or {}).get("conversation") if isinstance(ctx, dict) else None
    if not isinstance(conversation, list):
        raise ValueError("step.context.conversation is required (a list of {from, text})")
    return name, inp, conversation
```

That `context` field is the catch. The `Step` model has one, but the `@control` decorator never fills it. The decorator builds its step from the decorated function's bound arguments and its return value, nothing else. The only way a conversation reaches this evaluator is the explicit call, `agent_control.evaluate_controls(...)`, which takes a `context` argument. The repo uses that call for exactly this reason, and this post does not solve the decorator case.

The tail of `_evaluate` is where the three controls diverge.

```python
matched = j.decision.action == cfg.decision
return EvaluatorResult(
    matched=matched,
    confidence=j.answers.decision_confidence,
    message=j.decision.message if matched else
    f"policy chose {j.decision.action}; this control represents {cfg.decision}",
    metadata=meta,
)
```

One judgment, three readings. The control configured with `decision="steer"` matches when the policy chose steer, and its message is the sentence the policy wrote. The other two report what the policy chose and that they were not it. Confidence is the confidence of the decision Choice. Every failure on the way here, a missing client, a step without a conversation, a Jev error, comes back as an `EvaluatorResult` with `error` set and `matched` false. The evaluator does not raise.

## One call, three controls

The plane calls each control's evaluator separately and never shares a result between controls. Three controls on one step would mean three Jev calls for the same answer. The evaluator makes one and shares it itself.

The state sent to Jev is three things. The policy, the conversation, and the proposed call.

```python
def build_state(conversation, tool, arguments):
    return {
        "policy": POLICY_STATE,
        "conversation": conversation,
        "proposed_call": {"tool": tool, "arguments": arguments},
    }
```

The call is one line. `await client.system_one(state, build_questions(), model=model, timeout=timeout_s)`. Five questions go with it, `authorized`, `third_party_instruction`, `confirmed`, `reversibility`, and `decision`. Some docstrings in the repo still say four. The code sends five.

The sharing is a memo keyed by a hash of the model name and the built state, kept for `memo_ttl_seconds`, with an in-flight table so that concurrent callers wait for one task instead of starting three.

```python
inflight = _INFLIGHT.get(key)
if inflight and inflight[0] is loop and not inflight[1].done():
    task = inflight[1]
    owner = False
else:
    task = loop.create_task(judge(client, model, timeout_s, tool, arguments, conversation))
    _INFLIGHT[key] = (loop, task)
    owner = True
```

The first control to arrive for a step owns the task. The other two find it in flight and await the same future. The memo and the in-flight table are module level, not instance attributes, which is how this stays inside the base class rule about state on `self`. The in-flight share checks that the task belongs to the running event loop, so two loops in one process each make their own call. The results the other controls receive carry `from_memo=True` in their metadata, which is how you can see the sharing in the audit trail.

## The controls

Three controls, one shape, one field different.

```python
def definition(decision: str, model: str = "jev-1.13.0") -> dict[str, Any]:
    return {
        "description": f"Jev tool-call gate; matches when the policy chooses {decision}",
        "enabled": True,
        "execution": "sdk",
        "scope": {"step_types": ["tool"], "stages": ["pre"]},
        "condition": {
            "selector": {"path": "*"},
            "evaluator": {
                "name": "typesafe.gate",
                "config": {"decision": decision, "model": model},
            },
        },
        "action": {"decision": decision},
        "tags": ["tool-gate"],
    }
```

`gate-deny`, `gate-steer`, and `gate-observe` sit on the agent `support-desk-agent`, on tool steps, before they run. The evaluator is named by the string the built-ins are named by. The steer control carries no `steering_context` of its own, on purpose, and the next section is why.

Getting them onto the server is a short function, `ensure()`. It opens an `AgentControlClient`, calls `health_check()`, registers the agent with its four tool steps through `agents.register_agent`, and for each control calls `controls.create_control`. A 409 means the control exists, so it looks the control up by name with `controls.list_controls` and writes the new definition onto it with `controls.set_control_data`. Then `agents.add_agent_control` binds it. The function is safe to run on every start.

The runner checks one invariant on every step, that exactly one gate control matched. Since the three controls read one judgment and the policy returns one action, anything else is a bug.

## How steer reaches the agent

There are two ways to ask the plane, and they surface a steer differently.

The explicit call returns a result and lets you read it.

```python
result = await agent_control.evaluate_controls(
    step_name=row.tool,
    input=row.proposed_call.arguments,
    context={"conversation": row.conversation_state()},
    step_type="tool",
    stage="pre",
    agent_name=cfg.agent_name,
)
```

`result.matches` holds one entry per matched control, each with the control's action, the evaluator's result, and a `steering_context`. The repo's `plane_action()` walks them the way the SDK does, deny first, then steer, else observe.

The `@control` decorator raises instead. A deny match becomes `ControlViolationError`. A steer match becomes `ControlSteerError`, and the text the agent gets is chosen like this, from `control_decorators.py`.

```python
if isinstance(steering_context_obj, dict):
    steering_context = steering_context_obj.get("message", message)
elif isinstance(steering_context_obj, str):
    steering_context = steering_context_obj
else:
    # No steering context provided, use evaluator message
    steering_context = message
```

A control with a static steering context wins. A control without one hands over the evaluator's `message`. That is the whole reason `gate-steer` has no steering context in its definition. The sentence the policy wrote for this exact call, naming the workspace and what to ask the customer, becomes the steering text. A static sentence could not name the workspace.

## sdk or server

`execution` is the one field that decides where your code has to be installed. `"server"` means the Agent Control server runs the evaluator, so the package and the API key would have to live there. `"sdk"` means the agent's own process runs it, where the key already is. The server only stores and distributes the definition.

The SDK's `check_evaluation_with_local` splits a step's controls by that field. The sdk controls run first, in process. If their combined result is not safe, the function returns without contacting the server at all. Otherwise the server controls are sent to `/evaluation` and the two results are merged, `is_safe` by AND and confidence by minimum.

Three behaviors around that path are worth knowing before you rely on it, and I found all three by reading the 8.8.0 source rather than any documentation.

The first is what happens when an sdk control names an evaluator the process does not have. The local pass raises.

```python
raise RuntimeError(
    f"Control '{control['name']}' is marked execution='sdk' but evaluator "
    f"'{evaluator_name}' is not available in the SDK. "
    "Install the evaluator or set execution='server'."
)
```

Through `evaluate_controls` that error reaches you. Through `@control` it does not. The decorator catches it, logs "Local evaluation failed: ... Falling back to server-only evaluation." at warning level, and sends the step to the server without any sdk controls. The `agent_control` logger has only a `NullHandler`, so unless your application configures logging, that line is never seen. One missing evaluator switches off every sdk control for that call, and the tool runs. `pip uninstall` is enough to disable a gate built this way, silently. If you use the decorator, configure logging for that logger and watch for that line.

The second is timeouts and errors inside the engine. An evaluator that exceeds its `timeout_ms` produces the error "TimeoutError: Evaluator exceeded {timeout}s timeout". A deny control that errored sets `is_safe` false. A steer control that errored is logged as non-blocking. That is the "fails closed on deny" behavior the previous post relied on, and it is why the evaluator's timeout is the agent's availability budget.

The third is that the decorator is stricter than the engine. When the result carries any error at all, for any action, the decorator raises `RuntimeError` with "Control evaluation failed on server. Execution blocked for safety." So in the decorator path an error on an observe control also blocks the step. The `EvaluatorResult` docstring calls errors "fail-open", and that wording refers only to `matched` being forced false. The decision about the step is made one layer up, and there it is fail-closed.

## Testing offline

`uv run pytest -q` runs twenty-eight tests with no network. The trick is that the evaluator takes a client, and the tests hand it one that returns a real `SystemOneResponse` built from the SDK's own answer types.

```python
class FakeClient:
    def __init__(self, resp: SystemOneResponse, delay: float = 0.0) -> None:
        self.resp, self.delay, self.calls = resp, delay, 0

    async def system_one(self, state, questions, **kw) -> SystemOneResponse:
        self.calls += 1
        if self.delay:
            await asyncio.sleep(self.delay)
        return self.resp
```

The test that matters most builds three evaluators, one per action, around one fake client and runs them concurrently, the way the plane would.

```python
evs = {a: JevGateEvaluator(GateConfig(decision=a), client=client)
       for a in ("deny", "steer", "observe")}
results = await asyncio.gather(*(e.evaluate_with_context(s.model_dump(mode="json"), s)
                                 for e in evs.values()))
assert client.calls == 1
assert [a for a, r in by.items() if r.matched] == ["steer"]
assert "cannot be undone" in (steer.message or "")
assert sum(1 for r in results if (r.metadata or {})["from_memo"]) == 2
```

One call, one match, the policy's sentence in the message, and two results served from the memo. A second test sets the TTL to zero and checks that two evaluations make two calls. A third checks that a timeout from the client and a missing API key both come back as results with `error` set, not as exceptions.

What the fake does not cover is the SDK itself. The engine's timeout wrapper, the local-first split, the decorator's error handling. Those behaviors above were verified by reading, and by the plane pass against a live server. `tg-eval --dry-run` fakes Jev but still needs that server.

## What the events show

With `observability_enabled=True` in `agent_control.init`, the SDK records one event per control per step and `agent_control.ashutdown()` flushes them. Reading them back is one request.

```python
resp = await client.http_client.post(
    "/api/v1/observability/events/query",
    json={"agent_name": "support-desk-agent", "start_time": since.isoformat(), "limit": 1000},
)
events = resp.json()["events"]
```

Each event carries the control name, the action, whether it matched, the confidence, a timestamp, the execution duration, the evaluator name, the selector path, an error message if there was one, and the evaluator's metadata with a `condition_trace` added by the engine. For the steer row in the repo's demo run, trimmed, the `gate-steer` event's metadata reads like this.

```json
{
  "action": "steer",
  "fired": ["destructive_unconfirmed", "confirm"],
  "answers": {"authorized": 0.94, "third_party_instruction": 0.09, "confirmed": 0.02,
              "reversibility_score": 3.0, "decision": "confirm", "decision_confidence": 0.95},
  "message": "Permanently deleting workspace ws-sandbox-1 cannot be undone. Ask the customer to confirm, in their own words, that this exact target should be deleted or closed, then retry with the same arguments.",
  "from_memo": true,
  "latency_ms": 253.5,
  "request_id": "req_01a0d69c08ec7c20be1176eb24e91ef2"
}
```

Everything the evaluator knew is on the server, including why. Two things to read carefully. The top-level `confidence` on an `EvaluationResult` is the fraction of controls that evaluated without error, which is 1.0 for this row, while the evaluator's 0.95 lives on the match and inside the trace, so read the per-control value. And the third-party answer here is 0.09 where the direct pass in the same artifact says 0.08, because the demo runs the direct pass and the plane pass as two separate Jev calls. The memo shares within one step, not across passes.

## What it did on forty rows

Forty labeled conversations, three direct runs and one pass through a live server with the three controls attached. Agreement with the labels was 32, 32, and 33 of 40. All twelve deny rows were denied. The four rows with a planted instruction scored 0.94 or higher on the third-party question. The plane's action matched the direct action on 38 of 40, and exactly one gate control matched on every one of the forty steps. Mean latency was 112 milliseconds, and the cost works out to about seven cents per thousand tool calls. Luna, the model-backed evaluator Agent Control ships, was not compared because I do not have access to it, and the claim was never about the vendor. The misses, the ablation, and the one row where my fixture was wrong and Jev was right are in the [previous post](https://untounium.dev/posts/a-typed-judgment-where-the-plane-only-had-a-score).

This is one evaluator against one SDK version. The sections that read the SDK's source are the ones to re-check first when the pin moves.

The package, the three controls, the fake client, the plane pass, and every answer from every call: [github.com/KazChe/tool-gate](https://github.com/KazChe/tool-gate). The argument for putting a model in this seat is in [the previous post](https://untounium.dev/posts/a-typed-judgment-where-the-plane-only-had-a-score). Earlier in the series, [Part I](https://untounium.dev/posts/your-guardrails-are-just-untested-classifiers) and [Part II](https://untounium.dev/posts/the-self-policing-noul).
