# Slide craft: assertion-evidence, cognitive load, builds, diagrams, demos, notes

How to build and check slides with the deck CLI (catalogs, frontmatter, slots, lint, screenshots) is in `framework.md`. Numbers, charts and diagrams are in `data-visuals.md`. Evidence labels are explained at the top of `narrative.md`; sources are in `sources.md`.

## Contents

1. Assertion-evidence
2. Writing the title
3. Choosing the evidence
4. Cognitive load: what the research supports
5. Text on slides
6. Rhythm across the deck
7. Builds: segmenting, not decoration
8. Diagrams
9. Code
10. Demos
11. Speaker notes
12. Slide types that need special care

## 1. Assertion-evidence

Every content slide has two parts: a sentence title that states the slide's one claim, and a body that supports the claim with evidence, visual where possible, instead of a topic heading over a bullet list.

What the research shows **[some evidence]**: in controlled studies with engineering students who heard the same narration, those who saw assertion-evidence slides showed better comprehension, fewer misconceptions, lower perceived cognitive load and better delayed recall than those who saw topic-and-bullet slides (Garner and Alley 2013, n=110), and sentence headlines improved test performance over phrase headlines in a large lecture course (Alley et al. 2006). Preparing slides this way also appears to improve the presenter's own understanding. Limits: the studies come mostly from one research group, use technical teaching content and student audiences, and one follow-up found only a non-significant positive trend. The approach is also consistent with better-replicated multimedia principles (section 4), which is the stronger reason to adopt it.

Why it helps the author too: writing the claim as a sentence exposes slides that have no point. If you cannot write the sentence, the slide is not ready, and the fix is in the outline.

## 2. Writing the title

- A complete sentence with a verb, making a claim the audience could agree or disagree with.
- The claim is the takeaway, not a description: "Churn is concentrated in customers who never invite a teammate", not "Churn analysis" and not "This chart shows churn by segment".
- 12 words or fewer when you can, never more than two lines, and inside the layout's title length (`title.maxChars` in the layout catalog). Layouts with a narrow title column take about half as many characters as the full-width ones, so pick the layout with the title in mind, and shorten to the core claim ("Refunds over $200 need a lead") rather than dropping the verb.
- Specific: include the number, the name or the direction when there is one.
- Sentence case, no trailing period, no colon-and-subtitle constructions.
- A question is acceptable as a title only when the slide's job is to pose it and the next slide answers it.
- Exempt: title, section, agenda and closing slides, though a section title that states the section's point ("Where the time actually goes") beats a label ("Analysis").

Rewrites:

| Topic title       | Assertion title                                                            |
| ----------------- | -------------------------------------------------------------------------- |
| Market overview   | Mid-market buyers now run a formal security review before any trial        |
| Architecture      | Every request passes through one gateway, which is where we enforce limits |
| Q3 results        | Q3 revenue grew 18% while headcount stayed flat                            |
| Customer feedback | Admins love the audit log and cannot find the export                       |
| Next steps        | We need a decision on the pilot scope by 1 December                        |

## 3. Choosing the evidence

Ask what would make a skeptical listener believe the title, then choose the most direct form:

| The claim is about                           | Evidence                                             |
| -------------------------------------------- | ---------------------------------------------------- |
| A quantity, a change, a comparison           | Big number, chart or small table (`data-visuals.md`) |
| How something works, a structure, a sequence | Diagram, built in steps                              |
| What something looks like or does            | Screenshot, short video, or live demo                |
| What someone experienced or said             | A real quote with attribution, a photo               |
| A precise technical point                    | Code, with the relevant lines highlighted            |
| A set of parallel items                      | Two to four short lines, or a small table            |
| A single idea that needs to land             | A statement slide: the sentence alone                |

Bullets are the fallback, not the default. They are right for genuinely list-like content (three requirements, four steps). When you use them: parallel grammar, at most four, one level, fragments rather than sentences, and no bullet that merely restates the title.

Pictures must be evidence. Decorative stock imagery adds processing without adding meaning (coherence principle, below). A photo of the actual customer site is evidence; a handshake photo is noise. Give a photo the slide or half of it, never a small frame in the middle: `image` runs it edge to edge with the text on the side where the picture is calm (`text: left`, `right` or `bottom`), `image-reveal` opens with a full-slide title beat before docking the title and subtitle into a full-width header or footer bar to unveil the picture, `split` with `bleed: true` runs it to the edges of its half, and the cover and dividers take one in `<Media>`.

Show the product rather than describing it: one screen per slide, as large as the slide allows, with at most a few callouts on the parts the notes talk about. Ten thumbnails on one slide is a screenshot dump; nobody can read any of them.

Choose a layout by what the audience needs to read, compare, or do. If the deck lists a deck or brand layout for that job (including a code layout), start there and check that its slots and fixed regions hold the evidence. Otherwise use the kit choices below. Confirm the name in `deckster layouts <deck> --summary`, then open its full catalog entry for the exact fields, slots, limits and example. The [layout reference](https://sandrinodm.github.io/deckster/reference/layouts/) shows the rendered layouts. The installed catalog determines which ones you can use.

### Open, orient and close

| Layout | Use it when |
| --- | --- |
| `title` | You need a cover with the talk title, a short subtitle, presenter and date. |
| `section` | A new part needs a divider. Repeat the same divider treatment at each part. |
| `agenda` | The audience needs the order or timing of the session. Use `current` on a repeated agenda to show where they are. |
| `bio` | One speaker or guest needs an introduction that explains why they are here. |
| `recap` | People should leave a section remembering two to four points. Use `statement` for one line that needs the whole slide. |
| `sources` | Readers need a list of references they can follow. Cite a single claim in the slide's footnote where supported. |
| `closing` | The final slide should leave one prompt, takeaway or next step with ways to follow up. Use `ask` earlier for a decision tied to an amount. |

### Explain one idea or organise several

| Layout | Use it when |
| --- | --- |
| `statement` | One short claim needs the slide to itself. Use `size: giant` for a few memorable words and `quote` when a speaker's attribution is central. |
| `definition` | The audience needs a shared meaning for one term before the argument can proceed. |
| `default` | You need a plain Markdown heading and short body for material without a more specific structure. |
| `content` | The title makes a claim and prose or a short list supports it, with an optional aside. |
| `split` | The explanation and its visual evidence both matter enough to read side by side. Give a single dominant plot or drawing the space of `chart` or `diagram`. |
| `cards` | A few ideas are peers and each merits its own label, icon and explanation. |
| `features` | The audience needs to scan a wider inventory of capabilities with compact names and icons. |
| `bento` | One subject has facets of unequal importance, and a figure, visual or idea needs a larger tile. |
| `columns` | Several headed groups contain short lists, as in now, next and later. Use `status` to report each workstream's state. |
| `steps` | The audience needs an ordered procedure with a brief instruction at each stage. Use `diagram` when branching, connections or handoffs carry the point. |
| `faq` | The audience has recurring questions or objections with brief, direct answers. |

### Compare, quantify and decide

| Layout | Use it when |
| --- | --- |
| `stats` | A few independent headline figures make one point without needing a plot. Use `chart` with `BigNumber` for a single figure. |
| `equation` | The audience should see the arithmetic behind a figure, such as bookings × take rate = revenue. |
| `market` | The point is the relationship between nested market sizes, such as total and reachable demand. |
| `chart` | One quantitative pattern, figure or data table needs most of the slide. Choose the component by the message in [Data visuals](data-visuals.md). |
| `dashboard` | A small set of plots or mixed measures jointly supports the same conclusion. Give a detailed plot its own `chart` slide. |
| `table` | Readers need to look up or compare exact entries in a compact table. Use Markdown for text or the kit `Table` for formatted data. |
| `comparison` | Alternatives are evaluated against the same rows. Mark row winners where the evidence supports them, including tradeoffs the recommendation loses. |
| `pricing` | Each plan has a price and an inclusion list. Use `comparison` when the choice turns on comparing the same criteria row by row. |
| `matrix` | Named options need qualitative positions along two explicit axes. Use a scatter chart for measured coordinates. |
| `quadrants` | Content belongs in exactly four named groups, such as a SWOT, with a short list in each. |
| `strategy-canvas` | A few offers differ across shared buyer factors, and their profiles make a deliberate emphasis or tradeoff visible. |
| `shift` | Words or figures express one change between the old and new states. Use `before-after` when matched pictures are the evidence. |
| `risks` | A short risk register needs likelihood, impact and a mitigation for each item. Use `table` for exact scores or extra lookup columns. |

### Show how something works or looks

| Layout | Use it when |
| --- | --- |
| `diagram` | A flow, sequence, hierarchy, loop, stack or handoff is the evidence. Choose the component in [Data visuals](data-visuals.md#15-diagrams-when-a-picture-of-the-mechanism-beats-bullets). |
| `service-blueprint` | The audience should see where a customer's journey meets frontstage and backstage work and who owns the handoff. |
| `code` | A short snippet, diff or terminal session proves a technical point. |
| `demo` | A live or scripted component should do the work in front of the audience. Prepare its still or poster for preview and export. |
| `choose-path` | The presenter should be able to select either of two authored workflows and show its outcome. The static view shows both paths. |
| `image` | One photo should convey place, scale or a moment at full bleed. Use `split` if the explanation needs more space. |
| `image-reveal` | A title beat should open the slide before animating into a full-width header or footer bar (`dock: bottom` or `top`) to reveal an image across the rest of the page. |
| `screen` | One interface should be readable whole, in a device or browser frame with optional callouts. |
| `gallery` | Several separate views belong together and one deserves the largest frame. |
| `before-after` | Two visual states need equal weight in a side-by-side comparison. |
| `screen-story` | An offline product demo needs a magnified detail (`spotlight`), a registered before-and-after wipe (`wipe`), a desktop-to-phone transfer (`handoff`) or three sequential screens (`filmstrip`). |
| `vision-storyboard` | Three illustrated moments show what a future experience changes for one person. |
| `sketch-to-ship` | The claim is about how specific design choices moved from a working sketch to the finished result. Pin the same landmarks in both. |
| `product-cutaway` | Aligned artwork can separate the layers of a product to reveal what its parts do together. |

### Teach or demonstrate with people

| Layout | Use it when |
| --- | --- |
| `do-dont` | Learners need concrete examples of a practice to follow and a mistake to avoid. |
| `quiz` | The room should choose among fixed answers and then see the correct choice and its rationale. |
| `exercise` | Learners should produce something during a timebox. Give them instructions and name the expected output. |
| `conversation` | The order and wording of an actual exchange make the point. Use a sequence diagram for messages between systems. |
| `quote` | An attributed quotation from one person carries the point. |
| `voices` | Several brief testimonies establish a shared experience. |
| `proof` | One named customer's experience and measured result belong together in a case study. |
| `persona` | A research-grounded user's goals and frustrations explain a design decision. |
| `team` | The audience needs to meet the people behind the work. In a founder pitch, explain why each person is suited to the job. |
| `logos` | Named relationships with customers, partners or funders are the evidence. Use `proof` if the claim is a customer's measured outcome. |

### Plan work, make commitments and ask

| Layout | Use it when |
| --- | --- |
| `timeline` | A few dated milestones show what happens when without showing durations. |
| `schedule` | Several workstreams run for different durations on a shared time axis. |
| `roadmap-transit` | The plan turns on a specific dependency between parallel workstreams and a milestone it enables. |
| `roadmap-hill` | The discussion is about movement from discovering an approach to executing it, using two reviews of the same scopes. |
| `opportunity-map` | A site, route or expansion decision depends on a real or illustrative geographic constraint. |
| `future-back` | Start from a dated future outcome, trace the capabilities it requires, then land on a near-term test. |
| `status` | A review needs each workstream's state and any exceptions requiring attention. |
| `actions` | The audience needs to leave with an owner and deadline for each next action. |
| `ask` | A specific amount or commitment should buy concrete dated milestones. State the decision and what it enables. |

For build and artwork guidance on the product and strategy layouts, see [Visual patterns](visual-patterns.md).

For these recurring decisions, adapt the corresponding lookbook slide.

- **Pitch by analogy.** Start with a familiar market’s change. Reveal how the same mechanism works for the company, then show the assumption the audience should challenge. [Lookbook example](https://github.com/sandrinodm/deckster/blob/v0.7.0/decks/lookbook/slides/pitch-analogy.mdx)
- **Investment committee decision.** Put the decision and amount in the title. Pair the thesis with evidence and give the strongest objection a measurable condition for reconsideration. [Lookbook example](https://github.com/sandrinodm/deckster/blob/v0.7.0/decks/lookbook/slides/investment-committee.mdx)
- **Opportunity to experiment.** Start from the outcome and show the opportunity, competing options, and experiment. Keep alternatives visible when the experiment is revealed. State the measure and the baseline on the slide. [Lookbook example](https://github.com/sandrinodm/deckster/blob/v0.7.0/decks/lookbook/slides/opportunity-experiments.mdx)

## 4. Cognitive load: what the research supports

Working memory handles only a few items at once, and a listener is already using some of it to follow speech. Mayer's multimedia learning research gives the best-supported design rules. Median effect sizes are from his 2014 handbook review; they come mostly from short lab lessons with novice learners and immediate tests, so treat sizes as indicative, the direction as reliable.

| Principle               | What to do on a slide                                                                                                                | Evidence                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| **Coherence**           | Remove anything that is not needed for the point: decorative images, extra data, logos on every slide, tangents                      | 23 of 23 tests, d about 0.86                                         |
| **Signaling**           | Show the structure and point at what matters: assertion title, highlight color, arrows, section markers                              | 24 of 28 tests, d about 0.41                                         |
| **Redundancy**          | Do not put the narration on the slide as full sentences. People cannot read and listen to different words at once; they do one badly | 16 of 16 tests, d about 0.86                                         |
| **Spatial contiguity**  | Put labels on or next to the thing they describe, not in a legend or a caption far away                                              | 22 of 22 tests, d about 1.10                                         |
| **Temporal contiguity** | Show a visual at the moment it is being talked about, not before or after                                                            | Supported                                                            |
| **Segmenting**          | Break a complex explanation into steps the presenter advances                                                                        | 10 of 10 tests, d about 0.77                                         |
| **Pre-training**        | Introduce names and parts before explaining how they interact                                                                        | 13 of 15 tests, d about 0.75                                         |
| **Modality**            | Explain a visual in speech rather than in on-screen paragraphs                                                                       | 53 of 61 tests, d about 0.76; weaker for self-paced or long material |
| **Personalization**     | Conversational wording ("you", "we") in notes and slides                                                                             | Supported, mostly in short lessons                                   |

Qualifications that matter in practice:

- **Redundancy is about duplicated sentences, not about all text.** A few keywords placed next to the relevant part of a graphic help (Mayer and Johnson 2008). The assertion title is a short signal, not a transcript.
- **Expertise reversal.** Step-by-step builds and heavy signaling help novices and can slow experts **[evidence]**. For an expert audience, show more at once and move faster.
- **Read-alone decks are different.** With no narrator there is nothing for text to be redundant with, so explanatory text belongs on the slide.

Kosslyn's analysis of 140 real slide decks found the same rules violated almost everywhere: more than four bullets per list, more than two lines per bullet, everything shown at once instead of built up, and emphasis that did not match importance. Viewers reported being annoyed by these flaws but were poor at identifying them when asked, which is why a checklist and a rendered check beat intuition.

## 5. Text on slides

- A slide is read at a glance. If its point cannot be taken in within about three seconds, the slide holds two points or too much evidence: split it or cut it. (A chart takes a little longer to read; its test in `data-visuals.md` allows five.)
- Stay inside the layout's content budget. When text does not fit, the answer is to split the slide or move words to notes. Never shrink type or tighten spacing; the layouts own those and `deckster lint` reports it (`content-budget`, `off-brand`).
- One idea per slide. Two ideas become two slides; slides are free.
- Use the audience's words. Define a term the first time it appears if any part of the audience might not know it.
- Emphasis is a budget: one highlighted element per slide. If three things are bold, nothing is.
- Do not put a slide's title in the body again, and do not end slides with a "key takeaway" box: the title is the takeaway.
- Cite sources for data and quotes in small text on the slide. It costs nothing and buys credibility. A footnote is for a source or a caveat, never a claim.
- Fill the slide or shrink the content. A terminal or quote that takes half the slide and leaves a third of the canvas empty needs a portrait, an aside or a different layout.
- The most colourful element is the title's claim. A "-82%" delta in the accent should not outshine "2 days, not 11" if that is the title.
- An aside supports the highlighted mark; a second point in it is a second slide.
- Terminal output is real output from the tool, or visibly a sketch. Never make up plausible-looking results.

## 6. Rhythm across the deck

- In a deck long enough to have parts (more than about twelve slides, or more than about fifteen minutes), open each part with a section slide. In a shorter deck a section slide costs a slide the argument needs: mark the parts with the eyebrow above the title instead. Above about twelve slides, choose the section slides and surfaces on purpose rather than letting them fall out. Either way, vary layouts within a part. Three identical layouts in a row on the same surface read as monotony (`deckster lint` warns: `layout-repetition`). When the content really is three charts in a row, break the run with a statement slide that says what they add up to, or put one on a different surface.
- Use surfaces deliberately: a different surface for section breaks, statements and the key moment gives the deck a pulse without custom styling. In a long deck where most slides sit on the default surface, the eye stops noticing slides; two or three moments on another surface are enough to break that.
- Follow a dense slide with a light one: a chart, then a statement that says what it means.
- Plan one peak: the slide or moment the audience should remember (the result, the demo, the before-and-after). Clear space around it, and give it a surface its neighbours do not have.
- Make the section slides a set: the same surface and the same options on each (`numeral: large`, for example, sets the part number as a graphic), so each reads as a landmark rather than another slide. If the deck uses a transition other than the brand's, the dividers are the place for it, all with the same one.
- Keep motion sparse and short. The cover and the dividers may carry more of it than the body slides, which get their build and the brand's transition and nothing else.
- Vary the form when the content allows it, not only the layout name: two to four screenshots of one flow can share a `gallery`, an argument from the old way to the new one is a `shift`, one subject with a facet that matters most is a `bento`. Change the layout only when the content fits its budget as it is; cutting the evidence to fit a fresher layout is the wrong trade.
- Carry a picture across two slides with a `<Morph>` only when the same picture really continues; it is a signal that the subject stays the same, and used elsewhere it is decoration.
- Keep recurring elements consistent: the same color for the same entity in every chart and diagram, the same term for the same thing.

## 7. Builds: segmenting, not decoration

A build reveals a slide in the order the presenter explains it: segmenting, signaling and temporal contiguity (section 4) applied inside one slide. The audience sees each part while it is being talked about, and the newest part is the one that stands out. The research supports segmenting and signaling in general **[evidence]**; there is little research on slide builds as such, so the rules below are practice derived from it. How to write each kind of build is in `framework.md` (Builds, transitions and morphs).

Plan the build in the outline, not after the slides exist. For each evidence slide, the outline's Build column names what arrives at each step, or says "whole":

| Slide                                         | Build                                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| A line chart with a cause                      | 0 the line; 1 the highlight and the callout at the event; 2 the aside that says why              |
| A request through four services               | 0 the services; 1 to 3 a `<Journey>` along the path, one hop per step, in the order of the notes |
| A protocol handshake                          | 0 the actors; one message per step                                                               |
| Three events the speaker recounts in order    | each item a `focus` step                                                                         |
| Code with two points                          | 0 the block; 1 and 2 a step range on the lines each point is about                               |
| A photo, a quote, a statement, one big number | whole (numbers count up on their own)                                                            |

What earns a build:

- The notes walk the parts in an order: first, then, finally; a numbered list; a path. Build in that order, and only those parts.
- A chart whose point is a contrast or a change: context first, then the highlighted series or category, then the annotation that explains why (`data-visuals.md` section 9).
- A diagram whose claim is a path or a sequence: reveal it or travel it in the order of the explanation (`data-visuals.md` section 15).
- Code: the lines being discussed, one range per point.

What does not:

- Every bullet of every slide, by habit. A list the speaker does not walk through only slows the room down.
- A slide whose point is the whole picture: a photo, a quote, a statement, a single number, a logo wall.
- Effects chosen for variety. Keep the brand's entrance and the default `<Step>` effect; pick another only when it means something.
- Simple slides for an expert audience (expertise reversal, section 4): show more at once and use fewer clicks. Two or three steps on a slide is common; past five, ask whether it is two slides.
- A read-alone deck: the reader sees only the last step.

Rules that keep a build honest:

- The last step stands alone. Static mode, screenshots, the PDF and the PowerPoint show only it, so it must carry the whole claim: nothing left dimmed, nothing the conclusion depends on still hidden.
- Each step has a `[click]` cue in the notes, where the presenter says that part (section 11).
- Look at every step (`deckster shot <deck> <slide> --steps`), and click through the slide once in `deckster dev`: screenshots show each step at rest, not the motion.
- In a live talk with charts, diagrams or code, most of those slides have something the notes walk through, so most of them build. A deck that shows nearly all of them at once is what `deckster lint` reports as `few-builds`.

## 8. Diagrams

- A diagram should show the mechanism the title claims, not an inventory of parts. Title: "Every write goes through the queue before the database". Diagram: that path, highlighted.
- Limit a diagram to what fits working memory: about five to seven nodes visible at a level. For bigger systems, show an overview and zoom into one region per slide.
- Build in steps, in the order you will explain, and label on the diagram (segmenting, contiguity). The final state must still make sense in a static export.
- Flow reads left to right or top to bottom. Use position and grouping to mean something; do not let layout be arbitrary.
- Highlight the one path or component the slide is about; mute the rest.
- Which diagram component fits which claim, and how to stage one with steps, is in `data-visuals.md` section 15; the components are listed by `deckster diagrams --json`.

## 9. Code

- Show only the lines that carry the point, at a size readable from the back; elide the rest.
- Highlight the lines being discussed and step through them (a fence takes step ranges such as `{2-4|7}`; `deckster components --json` lists the code and terminal components). Never present a wall of code and talk over it. The `code` layout has a line budget; code that does not fit is a sign the slide shows too much.
- The title states what the code demonstrates ("Retries are one decorator"), not the file name.

## 10. Demos

Controlled research on demos in presentations is thin; this section is practice plus vendor data and should be held loosely.

- **Decide what the demo proves** and say it before starting: "Watch how long it takes to go from alert to root cause." A demo without a stated claim is a tour.
- **Show the most valuable thing first.** Gong's analysis of recorded sales demos associates winning demos with leading with the capability tied to the buyer's top priority, instead of following the product's menu order or building to a finale **[vendor data, correlational]**.
- **Frame before, land after.** One slide that sets up the scenario and what to watch for, the demo, then one slide that states what was just shown as an assertion.
- **Keep it short and scripted:** one scenario, a named user with a goal, three or so beats, realistic data. Put the click path in the notes.
- **Always have a fallback.** A recorded video or screenshot sequence for when the network, the build or the model fails. Live apps and videos take a `poster` for this reason (static mode and exports show it), and lint reports a demo without one. Tell the presenter in the notes when to switch.
- **Budget honestly.** Demos run long. Give the demo a time budget and a "skip to" point.


Use `screen-story` for authored, offline product screens. `pattern: spotlight` takes one screenshot
and a rectangle in percentages of that unscaled viewport. Both the outline and the enlarged inset
come from that image. `wipe` takes two registered screenshots of the same size. A live scrubber moves
the divider, while a finished handout labels and compares both versions. `handoff` pairs the sender's
action with the receiver's state. Keep the same record identifier visible on both devices.
`filmstrip` takes three distinct screens and action labels, and shows the full sequence at the end.

Use these components inside `layout: demo` for scripted AI and keyboard workflows:

- **CommandDemo** shows a workspace, palette and executed result. Give each command a distinct local
  result so the presenter can demonstrate another choice.
- **GroundedAnswer** shows the source brief and question, then the cited answer and the exact evidence.
  Use the source's wording and give the citation a specific page, section or record.
- **ReviewDiff** accepts the exact original and suggested text plus the shared sentence around it.
  Keep the human decision visible with the draft it produces.
- **RunTrace** pairs each observed tool call with its return. Show the draft and a specific human
  checkpoint before an action could affect anything outside the demo.

Each above uses normal deck advances and has a standalone static frame. Copy the relevant slide from
`decks/lookbook/slides/` and preview each reveal in both directions.

For production references, watch Stripe introduce a concrete checkout task before handing it to the demo
operator. Linear documents how command menus surface keyboard shortcuts, and Apple's Handoff shows what
it means to resume the same task on another device. GitHub pairs an agent session log with the changes
a human reviews. Apply those ideas to the product and data the audience came to see. [Stripe Sessions product keynote](https://stripe.com/sessions/2026/opening-remarks-and-product) · [Linear contextual menus](https://linear.app/now/invisible-details) · [Apple Handoff](https://support.apple.com/en-us/102426) · [GitHub agent management](https://docs.github.com/en/copilot/concepts/agent-capabilities/choosing-and-delegating-agent-work/agent-management)

## 11. Speaker notes

There is little direct research on notes. The guidance follows from the redundancy principle (the speaker should say what is not on the slide) and from practice.

For each content slide write:

1. **The line that lands the point:** the title's claim in spoken language, not read verbatim.
2. **The explanation:** what to say about the evidence, in the order the eye should travel. For a chart: what the axes are, where to look, what it means.
3. **Cues** in brackets: [click], [pause], [ask the room: …], [switch to demo], [if short on time, skip to X]. Every step of a build gets a [click] where its part is spoken, in step order, so the count of [click] cues is the slide's steps minus one; in a numbered or bulleted list put it after the marker (`2. [click] …`).
4. **The transition:** one sentence that makes the next slide the natural next question. Transitions are where talks feel coherent or disjointed, and they are the first thing presenters forget.

Conventions:

- Write for the ear: short sentences, contractions, "you" and "we". Notes are a script the presenter adapts, not prose to read aloud.
- Size to the budget: about 130 to 150 words per minute. A 60-second slide gets roughly 130 to 150 words of script at most; cues and optional material do not count.
- Put facts the presenter might be asked about (the source, the caveat, the exact figure) at the bottom under "If asked:" (or "If asked about price:"). Everything from the first such line on is reference material, not script, so keep the spoken part above it.
- Keep placeholders few. A slide's notes carry at most the two or three gaps the presenter would be asked about; everything else goes once into the handoff list. Notes that are mostly to-do items cannot be presented from.
- Notes are the right home for `[NEEDS: ...]` placeholders. Put them under "If asked:" or at the end, never in the middle of the script where they break the talk track; write the spoken part so it works with what is known today.
- The talk track obeys the same honesty rule as the slide. Do not hand the presenter a line that asserts something the user did not tell you (a business impact, how a sample was drawn, why a number moved). Offer it as a question for them to confirm instead.
- Do not put content the audience needs only in the notes if the deck will also be sent as a read-alone PDF.

Example:

```
Here's the number that changed our plan: nine out of ten customers who churned never invited a second person. [pause]
Not a pricing problem, not a feature gap. They never got a teammate in.
The grey bars are every other reason we tracked; none of them comes close.
If asked: n=412 churned accounts, Jan to Sep, source is the retention dashboard.
Transition: So the question becomes, why don't they invite anyone? That's the next slide.
```

## 12. Slide types that need special care

- **Title slide:** the talk's promise, not just its topic. A subtitle can carry the big idea.
- **Agenda:** only for talks over about 15 minutes, three to five items, phrased as the questions the talk will answer. Skip it for short talks.
- **Section slides:** a landmark and a breath. One line. Give every divider of the deck the same surface and options; `numeral: large` turns the part number into the slide's graphic.
- **Statement slides:** the big idea, the turn in the story, the ask (an ask with an amount and the milestones it buys has its own `ask` layout). Use sparingly so they keep their weight. When two or three words carry the claim, mark them `*…*` and set `emphasis: underline`. A statement slide's frontmatter `title` is not shown on the slide, but it is the slide's line in the outline, the presenter view and the export: write the claim there too, not a label like "Quote".
- **Quote slides:** real, attributed, short, and chosen because the wording itself is evidence.
- **Customer proof:** one or two named customers with their before-and-after numbers persuade more than a wall of logos. Put the person's words and the numbers on one `proof` slide, the strongest result first.
- **Comparison slides:** same attributes in the same order on both sides; highlight the row that decides it. Keep the rows where the recommended option loses (`winner:` on those too): an honest trade reads as confidence.
- **Market size:** bottom-up, as the customers you can reach times what each pays, convinces more than a large top-down figure in nested shapes; a `market` slide can show the sizes, and an `equation` slide shows the bottom-up multiplication; the sources of each term go in the footnote and the notes.
- **The ask:** one specific amount, never a range, followed by the dated milestones it buys (`ask`).
- **Team slides:** say why each person is the right one for this problem (the `edge` line on `team`), not only where they worked.
- **Product screens:** one `screen` per slide, with callouts in the order the notes walk them. The screenshot is the app alone, without its own browser bar or device bezel, since the frame draws those.
- **Closing slide:** the takeaway and the next step, since it stays up during Q&A. Not "Thank you", not "Questions?".
- **Appendix:** backup slides for likely questions, after the closing slide, each marked `hidden: true` so the talk skips it, and "Backup" in its eyebrow; they add nothing to the time budget (`framework.md`, Time budgets). They are exempt from the one-idea discipline but still need assertion titles, so they can be found and used under pressure.
