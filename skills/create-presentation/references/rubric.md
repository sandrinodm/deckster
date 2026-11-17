# Final critique rubric

Score the finished deck as a skeptical member of the primary audience would, not as its author. For each criterion give 0 (fails), 1 (partly) or 2 (meets), with one line of evidence naming slides. Fix every 0, and every 1 that is cheap to fix, then re-score. Keep the scores as your working record; the handoff reports them in plain words (see Reporting).

Be hard on the deck. A rubric where everything scores 2 on the first pass was not applied.

## A. Purpose and audience

| #   | Criterion                                            | How to check                                                                        |
| --- | ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| A1  | The outcome is specific and observable               | The brief says who will do what afterwards; the closing slide asks for exactly that |
| A2  | The deck is built for the stated primary audience    | Vocabulary, depth and examples fit what they know and care about                    |
| A3  | Each secondary audience has something that is theirs | Point to the slides; none means they were forgotten                                 |
| A4  | The likely objection is raised and answered          | Find the slide. Not in the appendix only                                            |

## B. Story

| #   | Criterion                                               | How to check                                                                            |
| --- | ------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| B1  | Read-through: titles alone tell the argument            | Read only the titles in order. No gaps, no repeats, no topic labels                     |
| B2  | The opening earns attention in the first minute         | Slide 1 or 2 is a hook, complication, or the answer; not agenda, bio or company history. Proof comes early: a pitch shows traction within its first few slides, a product talk reaches the product quickly |
| B3  | The structure fits the format                           | Compare with the spine in the format file; deviations are deliberate                    |
| B4  | There is one clear peak                                 | Name the slide the audience should remember                                             |
| B5  | The close restates the message and makes a specific ask | Last content slide: takeaway and next step, not "Thank you" or "Questions?"             |
| B6  | Nothing is there only because it was available          | For each slide: would the outcome suffer if it were cut?                                |

## C. Slides

| #   | Criterion                                                          | How to check                                                                        |
| --- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| C1  | Every content slide has an assertion title                         | A sentence with a verb, making a claim, within budget                               |
| C2  | The body is evidence for the title                                 | Visual where possible; bullets only for list-like content; a job with a layout of its own (a product screen, a competitor map, market size, the ask, a case study) uses it (`slide-craft.md`, section 3) |
| C3  | One idea per slide                                                 | No slide makes two claims                                                           |
| C4  | Text is within the layout's content budget and title length        | `deck lint` reports no `content-budget` or overflow finding                    |
| C5  | Slides do not duplicate the narration                              | No paragraphs meant to be read aloud (read-alone decks excepted)                    |
| C6  | The deck has rhythm                                                | Layouts and surfaces vary; no three identical layouts in a row; parts are marked (section slides in a long deck, all with the same options, or eyebrows in a deck of about twelve slides or fewer); the peak sits on a surface its neighbours do not have; any transition other than the brand's belongs to one role |
| C7  | Evidence is built in the order of the notes, and only where it helps | Each chart, diagram, code or list slide the notes walk through builds in that order, with a `[click]` per step; photos, quotes, statements and single numbers stay whole; `deck lint` reports no `few-builds`; the last step stands alone |
| C8  | No raw styling                                                     | No hard-coded colors, fonts, sizes or positions                                     |

## D. Data (skip if no numbers)

| #   | Criterion                                     | How to check                                                          |
| --- | --------------------------------------------- | --------------------------------------------------------------------- |
| D1  | Each data slide's form fits its message       | Decision guide in `data-visuals.md`; a number or table was considered |
| D2  | One thing is highlighted and directly labeled | In the screenshot the highlight is unmistakable; no chart lint findings |
| D3  | Units, period and source are present          |                                                                       |
| D4  | Axes are honest                               | Bars from zero, no dual axes, deliberate ranges                       |
| D5  | The title's claim is what the data shows      | Recompute any stated change from the supplied values                  |

## E. Integrity

| #   | Criterion                | How to check                                                                           |
| --- | ------------------------ | -------------------------------------------------------------------------------------- |
| E1  | Nothing is invented      | Every number, name, quote and claim traces to the user's material or a cited source    |
| E2  | Gaps are marked          | `[NEEDS: ...]` placeholders exist where proof is missing and are listed in the handoff |
| E3  | Confidence is calibrated | Estimates and unknowns are labeled as such                                             |

## F. Delivery

| #   | Criterion                                                   | How to check                                                                                                                                                                              |
| --- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Every content slide has speaker notes that add to the slide | Spoken point, explanation, cues, transition                                                                                                                                               |
| F2  | Budgets sum to the time available with slack                | `duration` is set in `deck.config.ts`; total at or under about 90% of it; cuttable slides are marked                                                                                                                  |
| F3  | Notes fit their budgets                                     | About 130 to 150 words per minute                                                                                                                                                         |
| F4  | Format-specific needs are met                               | From the format file: practice and checks (training), talk track and objections (sales), fallback and landing slide (demo), options and appendix (executive), sourced traction (investor) |
| F5  | Demos and live elements have a fallback                     | Poster or recording, and a switch cue in the notes                                                                                                                                        |

## G. Rendered check

| #   | Criterion                      | How to check                                                                |
| --- | ------------------------------ | --------------------------------------------------------------------------- |
| G1  | `deck lint <deck>` is clean in the deck's brand | No errors; every remaining warning has a stated reason |
| G2  | Every screenshot was opened and looked at | Title dominant; each slide's point taken in at a glance (about three seconds); nothing clipped, cramped, or stranded in an empty slide; each chart's point readable in five seconds with its highlight obvious; each diagram's main path easy to follow |
| G3  | The deck looks like one deck   | Consistent brand, consistent colors for the same entities                   |
| G4  | Stepped slides build in the order of the notes | `deck shot --steps` for each stepped slide: every step shows what the presenter is saying then, and the last step stands alone |

Score G from the pictures, not from the source. If a command could not run, mark the affected rows "not verified", say which command failed and what it printed, and do not claim a visual check that did not happen.

## Reporting

Keep the scores for yourself and for anyone who asks. In the handoff to the user, translate them: name the weakest two or three points in plain words with the slides concerned, say what you fixed, and list what is left open. The block below is the internal record, not the message.

```
Rubric: A 7/8, B 11/12, C 15/16, D 9/10, E 6/6, F 9/10, G 7/8
Weakest: B4 (no clear peak: slides 9-12 are all the same weight), F5 (demo fallback not recorded)
Fixed in this pass: C1 on slides 4, 7, 11 (topic titles rewritten), D4 on slide 8
Left open: [NEEDS] x3 (listed above); demo recording needs the presenter
```
