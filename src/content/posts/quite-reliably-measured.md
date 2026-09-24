---
title: "Quite reliably, measured"
datePublished: 2026-09-26T12:00:00.000Z
slug: quite-reliably-measured
cover: https://dhbtuus86mod.cloudfront.net/caliper-speech-bubble-cover.png
seoTitle: "33, 36, 35, and 6 of 6"
seoDescription: "A LinkedIn thread said frontier models do common refactorings quite reliably, and a reply said quite reliably is not enough. Nobody had a number. Twelve fresh Python cases, a deterministic grader, five arms, $2.67."
tags: untested-classifiers, evaluation, refactoring, claude-code, rope
---

*Continues the series on guardrails as untested classifiers*

A [thread on LinkedIn](https://lnkd.in/p/ereiE4i6) last week made a claim and got an objection, and neither side had a number.

Jason Gorman made the claim. Frontier coding models now do the common refactorings "quite reliably out-of-the-box", and he keeps a library of small refactoring skills, each a summary plus one before/after example, for the gaps. Two replies made the objection. For refactorings you want a deterministic tool that handles the AST, because otherwise you have to review every affected line, and "quite reliably is not enough."

I have spent two posts arguing that a guardrail is a classifier nobody scores. A refactoring is the same kind of thing with a much better oracle, because it has a postcondition you can check. Behavior preserved, shape achieved, nothing else touched. So I built the grader, then ran the argument through it. Total spend, $2.67.

## The grader

Twelve cases, six refactorings times two fresh samples. The six are Extract Function, Inline Function, Rename, Introduce Parameter Object, Replace Magic Literal with Constant, and Replace Nested Conditional with Guard Clauses. Each case is a small Python module with a green test suite and an instruction that names the target interface exactly, the way a person would ask. "Introduce a dataclass `Line` with fields `unit_price`, `quantity`, `discount_pct`, in that order, and change `line_total(unit_price, quantity, discount_pct)` to `line_total(line)`."

The oracle runs four checks on whatever comes back and names the first one that fails.

1. **Compiles.** Every file parses.
2. **Behavior.** A held-out test suite, written against the named interface, that the thing being graded never sees.
3. **Shape.** AST assertions. The dataclass exists with those fields in that order, the function takes one parameter, the old name is gone everywhere, the body starts with a guard, no literal `85` remains inside `status`.
4. **Collateral.** Files outside the allowed list are byte-identical, listed functions have an identical AST, no new imports.

The fixture checks itself. Every reference solution passes all four, every untouched original fails the shape check, and a hand-written wrong version of each case fails on behavior and nothing earlier. Two of my own wrong versions did not fail when I first wrote them, which is the whole argument for building the grader before the thing it grades. The cases were then hashed, and the runner refuses to start if the hash has moved.

## The arms

Same input to each, a fresh copy of the case plus the instruction, and the oracle grades the output.

- **Sonnet through the API, bare.** One call to `claude-sonnet-4-6`, the files and the instruction, one forced tool that returns the changed files whole.
- **Sonnet through the API, with a skill.** The same call with a Gorman-format skill for that refactoring in the system prompt, a summary plus one example in a domain not in the fixture.
- **Claude Code headless, bare.** `claude -p` inside the case, pinned to the same `claude-sonnet-4-6` with `--model`, with the user-level configuration stripped so it sees only the project. It can read the tree, run the tests, and edit in place. Claude Code also billed a little Haiku 4.5 for its own housekeeping, about 4 percent of the agent spend, which the CLI reports and the artifact keeps.
- **Claude Code headless, with the skill.** The same, skill appended to the system prompt.
- **rope.** The deterministic refactoring library for Python, driven by a spec I wrote per case, for the three refactorings it implements. rope also has a pattern rewriter, `restructure`, that could swap a literal for a name once someone writes the pattern and adds the constant by hand; I counted that as not implemented, because the hand-written part is the same translation cost the spec already carries.

Three runs per case for the model arms, because the claim under test is about reliability.

## The numbers

| arm | pass | behavior changed | did not refactor | touched other things | per trial |
| --- | --- | --- | --- | --- | --- |
| API, bare | 33/36 | 0 | 3 | 0 | $0.009, 4 s |
| API, with skill | 33/36 | 0 | 3 | 0 | $0.010, 4 s |
| Claude Code, bare | 36/36 | 0 | 0 | 0 | $0.028, 19 s, 5 turns |
| Claude Code, with skill | 35/36 | 0 | 1 | 0 | $0.028, 21 s, 5 turns |
| rope, within its coverage | 4/6, then 6/6 with a reorder step | 2, then 0 | 0 | 0 | free, plus a spec per case |
| rope, coverage of the catalog | 6/12 | | | | |

Across 144 model trials there was no behavior change, no file or function touched outside the instruction, and no compile error. Every case had the same outcome on every run, with one exception in one arm. Every miss by a model is the same case.

## The one case

The discount-eligibility case asks for guard clauses "so that no if statement is nested inside another if". Both API arms produced, on every one of their six runs, a byte-identical version with one nested `if`.

```python
    if customer is None:
        return 0.0
    if not customer.get("active"):
        return 0.0
    if order_total >= 100:
        if coupon == "SAVE20":
            return 0.2
        return 0.1
    if coupon == "SAVE20":
        return 0.05
    return 0.0
```

The tests pass. It is a good guard-clause rewrite. It violates the one explicit constraint in the instruction, and my reference met that constraint with a conditional expression. The oracle is right by the letter, and the honest reading is that my constraint was stricter than the refactoring needs. I left the case frozen, because editing cases after seeing results is how test sets stop meaning anything.

The bare agent passed it three times out of three by flattening the condition differently. It wrote `if order_total >= 100 and coupon == "SAVE20"` returning 0.2, then `if order_total >= 100` returning 0.1. Same model, same instruction. The agent with the skill passed twice and produced the API version once.

Why the agent got it and the one-shot call did not, I cannot fully say. The agent ran the tests on every trial; its own closing summary says so in all 72. But the tests it could run are the ones that ship with the case, and they cannot see nesting, so they passed on the skill arm's miss too. The likeliest difference is the mode of work, editing a function in place after reading it, against rewriting a file whole in one reply. That is a guess from one case, and it came at a price. The agent cost three times as much per trial and took five times as long.

## What the thread gets

**"Quite reliably" has a number now.** On these twelve cases it is 92 percent for a one-shot rewrite, 100 percent for the bare agent, and 97 for the agent with the skill, with the one disagreement being about the letter of an instruction rather than about correctness. The fear behind "review every affected line", a silent behavior change, did not happen once in 144 trials.

**The skill did nothing measurable.** Same outcomes on the API, one miss against zero on the agent, which is within noise at this size, and a couple of hundred more tokens per call. Gorman's own observation, that the models already know the common ones, held on all six. The before/after example is a fine way to teach a person; the model did not need it here.

**The deterministic tool is perfect where it exists and absent where it does not.** rope did every rename, inline, and extract correctly. It also cannot do three of the six refactorings at all, and on extraction it chose its own parameter order, `(entered_hour, base)` where the instruction said `(base, entered_hour)`, because there is no way to tell it. The first rope run scored four of six for that reason; adding the reorder step a person would take next made it six of six, and both runs are in the repo. The replies were right that the AST tool is trustworthy. They skipped the part where someone has to translate the request into offsets and refactoring classes, and the part where half the catalog is not in the box.

**The harness mattered more than the skill.** The gap between 33 and 36 is one case, and it is not the model. The likeliest cause is how the model worked on the file, not what it knew.

What this is not is a benchmark. Twelve cases, one model, small files, instructions written to be gradable. It is a shape, and the shape is the same one the guardrail posts found. Adjectives on both sides of an argument, and a number that cost an afternoon and under three dollars.

Code, cases, every artifact with every diff, and the rope runs before and after the reorder step: [github.com/KazChe/refactoring-oracle](https://github.com/KazChe/refactoring-oracle). The guardrail posts this continues: [Part I](https://untounium.dev/posts/your-guardrails-are-just-untested-classifiers) and [Part II](https://untounium.dev/posts/the-self-policing-noul).
