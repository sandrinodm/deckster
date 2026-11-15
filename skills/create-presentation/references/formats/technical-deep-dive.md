# Format: technical deep dive, architecture or design review, incident review

The audience is technical peers who will evaluate the reasoning, not just receive it. They want to understand how it works, why it was built that way, what the trade-offs are and where it breaks. Credibility comes from precision and candor. General findings on cognitive load apply strongly here because the material is complex; note that experts need less scaffolding than novices (expertise reversal), so do not over-explain what this audience already knows.

## Spine options

**Design or architecture proposal (seeking a decision or feedback):**

1. The problem and constraints: requirements, scale numbers, what must not break.
2. The proposal in one sentence and one diagram.
3. How it works: the main path, built in steps.
4. Alternatives considered and why they lost, in a comparison on the stated criteria.
5. Trade-offs and risks: what gets worse, failure modes, open questions.
6. Plan: migration, rollout, how you will know it works.
7. What you want from the audience: decision, review of a specific area, known unknowns.

**Explaining an existing system (teaching):**

1. What it does and why it exists.
2. The 10,000-foot diagram with five to seven boxes.
3. One request, or one unit of data, followed end to end.
4. Zoom into the two or three interesting parts.
5. Where it fails and how it recovers.
6. How to work with it: where the code is, how to debug, who owns it.

**Incident review:**

1. Impact, plainly: who was affected, how long, how badly.
2. Timeline of what happened, with what people knew at each point.
3. Contributing causes: systems and conditions, not blame.
4. What went well and what was hard.
5. Actions, each with an owner and date.
6. The general lesson for teams that were not involved.

**Research or evaluation readout:** question, headline finding first, method, results, limitations, implications.

## Diagrams carry the talk

- Start with the overview, then keep the same diagram and zoom or highlight, so the audience keeps their map. Reusing one visual vocabulary across slides lowers load.
- Follow one concrete thing through the system (a request, a message, a user action). A `<Flow>` with a `<Journey>` walks it one hop per step (`data-visuals.md` section 15).
- One diagram, one claim, stated in the title: "Writes are acknowledged before replication, which is where we can lose data".
- Introduce component names before showing how they interact (pre-training).
- For an expert audience, build in fewer, larger steps.

## Code, data and numbers

- Show the smallest code that makes the point, highlighted line by line. Link to the repo for the rest.
- Real numbers with units and conditions: "p99 180 ms at 2k rps on 3 nodes". Benchmarks state the setup. See `data-visuals.md`; distributions (latency percentiles, histograms) matter more than averages for this audience.
- Never invent benchmarks, capacity figures or incident details. `[NEEDS: ...]`.

## Honesty about limits

State what it does not handle, what is unknown, and what you would do differently. Engineers trust speakers who show the sharp edges and discount those who do not. Presenting alternatives and counter-arguments also persuades better than a one-sided case.

## Mixed technical levels

Common in design reviews: deep experts in the area plus adjacent engineers and managers. Keep the main line at the adjacent-engineer level, put the expert depth in marked deep-dive slides and the appendix, and give managers one slide near the start with the decision, cost and risk. See `audiences.md`.

## Notes for this format

The explanation in the order the diagram builds; the exact figures and their conditions; "If asked" for the predictable challenges (why not use X, what happens when Y fails, how does this scale).

## Pitfalls

- The whole architecture on one unreadable slide.
- Describing components one by one with no flow through them.
- Hiding the trade-off or the failure mode.
- Walls of code or config.
- Benchmarks without conditions.
- No stated ask in a review.
