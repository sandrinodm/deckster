# Audiences: analysis and mixed rooms

## Audience analysis in five questions

Answer these for each distinct group in the room. Put the answers in the brief's audience table.

1. **What do they already know?** Decides vocabulary, how much setup is needed, and what would bore them. Guidance that helps novices can slow down or irritate experts **[evidence]** (the expertise reversal effect), so "explain everything to be safe" is not safe.
2. **What do they care about?** Their goals, metrics, fears. The same fact matters to different people for different reasons.
3. **What do they need to do afterwards?** Decide, approve, buy, adopt, perform a task, tell others. If nothing, ask why they are in the room.
4. **What will they push back on?** The objection you would raise in their seat. Plan to answer it in the talk, because answered objections persuade and ignored ones fester (see `narrative.md`).
5. **What is their relationship to you and the topic?** Trusting, neutral, skeptical, hostile; choosing to attend or required to.

If you cannot answer these and cannot ask, write your best guess into the brief as an assumption. A wrong explicit assumption gets corrected; an unstated one produces a generic deck.

## Quick profiles

Starting points, not stereotypes. Adjust to what the user tells you.

| Audience                         | Cares about                                                   | Wants from a talk                                                   | Avoid                                                           |
| -------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------- |
| Executives, board                | Outcomes, risk, cost, timing, trade-offs                      | The answer first, the decision needed, confidence the detail exists | Building up to the point, process narration, unexplained jargon |
| Engineers, technical experts     | How it works, correctness, trade-offs, failure modes          | Specifics, real numbers, diagrams, honest limitations               | Marketing language, hand-waving, hiding the hard part           |
| Buyers, economic decision makers | Business impact, risk of change, proof it works elsewhere     | Problem framed in their terms, credible proof, a clear next step    | Feature tours, your company history up front                    |
| End users, practitioners         | Their daily work getting easier                               | What changes for them, shown not told                               | Abstract benefits, org-chart reasoning                          |
| Sales and customer-facing teams  | Winning deals, not looking foolish with a customer            | What to say, to whom, when; answers to hard questions               | Theory with no talk track                                       |
| New hires, learners              | Becoming competent and feeling they belong                    | Clear steps, practice, permission to ask                            | Assumed context, acronyms, firehose                             |
| Investors                        | Size of the outcome, why this team, why now, evidence of pull | A clear story they can retell to partners                           | Vague market claims, hiding weak numbers                        |
| General or public audience       | Why it matters to them                                        | One idea, a human story, plain language                             | Insider framing, more than one main point                       |
| Whole company                    | What it means for them and their team, honesty                | Clarity about direction and what changes, recognition               | Spin, metric dumps without meaning                              |

## Mixed audiences

A talk written for everyone lands with no one. When the room is mixed:

1. **Name the primary audience.** The primary audience is whoever must act for the outcome to happen. Design the spine, the vocabulary and the close for them. Say who it is in the brief.
2. **Give each secondary audience a reason to stay.** For each group, identify the one or two slides that are specifically theirs and say so aloud ("for the engineers in the room, this is the part you will be asked about"). People tolerate material aimed at others if they know theirs is coming.
3. **Layer, do not average.** Keep the main line simple enough for the least expert person who matters, and add depth in clearly bounded places: a deeper slide per section, an appendix, a linked doc, or a callout in the notes. Averaging the depth bores experts and loses novices at once.
4. **Translate, do not repeat.** State a key point once in the primary audience's terms and add its meaning for the other group in a clause: "p99 latency fell from 900 to 300 ms, which for support means the timeout tickets stop."
5. **Define terms in passing.** A six-word gloss the first time a term appears costs experts nothing and keeps everyone else.
6. **Put depth in the appendix and say it exists.** Backup slides let you answer the expert's question without making everyone sit through it. Reference them once ("the full benchmark is in the appendix").
7. **Let the notes carry branches.** Speaker notes can hold "if the room is mostly technical, spend longer here; otherwise skip to…".

In the outline, mark which audience each slide primarily serves. If one group has no slides, they should not be in the audience definition, or the outline is wrong. If every slide is marked "all", the layering has not been done.

## When one deck must become several

If the audiences need different outcomes (for example, engineers must adopt and executives must fund), one talk is usually the wrong answer. Propose a shared core (problem, big idea, proof) with a different opening, depth and ask per audience. With one slide per file and the order in a manifest, variants can share most slides; offer this instead of a compromise deck.

## Senior and expert audiences

- Lead with the answer and the ask. Expect to be interrupted; make each slide understandable without the ones before it.
- Prepare for the drill-down. Know which three questions are most likely and have a backup slide for each.
- Show your confidence level. Say what is known, what is estimated and what is unknown. Experts trust calibrated speakers and punish overclaiming.
- Be brief. Plan to use half the slot and offer the rest to discussion.

## Reluctant or skeptical audiences

- Start with common ground: a problem or goal they already accept.
- Raise their main objection yourself, early, and answer it with evidence.
- Use proof from sources they trust (their own data, peers, independent benchmarks) over your own claims.
- Ask for a small, reversible next step rather than full commitment.

## Cultural and language considerations

For international or non-native audiences: plain words, short sentences, no idioms or sports metaphors, numbers with units and explicit date formats, and a slower pace in the notes. Slides can carry slightly more text than usual for these audiences, since reading a second language is often easier than hearing it **[practice]**; this is a deliberate exception to the redundancy guidance in `slide-craft.md`.
