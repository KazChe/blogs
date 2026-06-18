---
title: "Do You Actually Need Superpowers?"
datePublished: 2026-06-18T12:00:00.000Z
slug: do-you-actually-need-superpowers
cover: https://dhbtuus86mod.cloudfront.net/superpowers.jpg
---


# Do You Actually Need an Agentic Coding Framework?

I keep running into frameworks like [Superpowers](https://github.com/obra/superpowers). Call them frameworks, skill libraries, methodologies, whatever you want. The pitch is always some version of the same thing: give your coding agent a structured way to work, and it'll stop flailing and start shipping. They clearly have benefits, especially if you're doing large-scale development. But I've got a development background, and the way I already work with coding agents is pretty simple. I come up with phases during initial planning, I bake in a test-first approach as part of that planning, then I go through the feedback loop. Reiterate, change, move forward. So I wanted to figure out, honestly, do I actually need one of these?

I went and read through what Superpowers actually is. And here's the thing I noticed.

## It's basically my workflow, packaged

Strip away the branding and the "methodology" underneath Superpowers is the loop most of us already run. It interrogates you to pull out a spec. It shows you the design in chunks small enough to read. It gets your sign-off, writes a plan, then implements against it. Brainstorm, plan, build, test, review.

That's phased planning plus a feedback loop. If that's already how you work, congratulations, you've independently arrived at most of what these frameworks are selling. You're not missing some secret technique that everyone else has and you don't.

So if the core loop is the same, what are you actually getting? It's free and open source, so this isn't about money. The cost is overhead and ceremony, and the question is what that overhead buys you.

## What a framework adds on top

As far as I can tell, three things.

**Automatic triggering.** The skills fire on their own. You don't have to remember "did I tell it to write the test first? did I ask for a review pass before merging?" That mental tax just goes away. If you're disciplined, this is marginal. But if you're tired, rushed, or jumping between five projects in an afternoon, this is the difference between always doing it right and usually doing it right. And usually isn't the same thing, just ask my neighbor.

**Enforced opinions.** Superpowers doesn't suggest test-driven development. It makes the agent write a failing test, watch it fail, write the minimal code, watch it pass. It'll delete code written before the tests existed. Now, I already work test-first. I plan that way, and I expect tests before implementation as a matter of course. So for me this isn't a new habit the framework is teaching me, it's the same discipline I already hold, just enforced automatically instead of by me remembering to ask for it. That's worth something. But it's a different value proposition than "this will make you write tests." If you don't already work this way, the framework imposes the habit. If you do, it just guarantees the habit holds even on the days you'd otherwise cut the corner.

**Subagent orchestration.** This is the one part that's genuinely beyond my manual phase loop. It dispatches a fresh subagent per task, with a two-stage review, so the main agent's context stays clean and it can run autonomously for a couple of hours without drifting off the plan. That's a real context-management architecture, not just process discipline dressed up. If your work involves long autonomous runs, this is the piece that's actually hard to recreate by hand.

## So who is it for?

Here's where I landed. The question isn't capability, it's scale and repeatability.

A framework like this earns its keep when you're running long autonomous sessions where the agent needs to stay on track without you babysitting it, when you're on a team and you want every developer's agent behaving identically, or when you specifically want the discipline externalized so you stop relying on yourself to remember to enforce it.

It's overkill when you're a solo dev with decent instincts running a tight loop on small-to-medium tasks. The ceremony will cost you more than it gives back. And if your existing process already captures the gains, which, if you're reading this and nodding along, it probably does, then you're adding overhead for its own sake.

## The caveat nobody mentions

These frameworks are opinionated. TDD always. YAGNI. DRY. Review gates between every task. If those happen to match how you'd work anyway, great, you get free enforcement. In my case the test-first part lines up perfectly, so that piece is pure upside. But if some of the opinions don't match how you work, you're adopting somebody else's engineering religion wholesale. And overriding a baked-in rule every time it gets in your way is more annoying than just not having the rule at all.

## My actual take

Here's the way I'd summarize it. A framework like Superpowers is most valuable to the version of you that's least like an experienced developer with a working loop. Junior engineers who don't yet have the instincts. Big, inconsistent teams that need a common floor. Or your own future self at 0200, three coffees deep, about to skip the review step.

For my workflow as it stands, the test first discipline and the planning loop are already there. I'd mostly be paying ceremony to get the autonomous-subagent feature.

So is it needed? No. Is it useful, under the right conditions? Yes, bigly, and knowing which of those two answers applies to you is the whole decision.

If you've already got a working loop, don't adopt a framework because it's trending. Adopt it because you've identified the specific gap(s) it fills for you. And if you can't name that gap, you've probably already got everything you need.