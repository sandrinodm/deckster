Illustrative content: not real data. Halden, its people, its clients and every Halden number are fictional. Numbers about the framework itself (layout, chart, diagram and rule counts, command output) are real and were read from this repository.

# Brief: Slides an agent can write

Assumptions: built without a review round (no user to ask); the presenter is a fictional design engineer; "deckster" is the framework's name; Halden's adoption story is the illustrative running example for every chart.
Format: product presentation at a meetup, demo-led. Duration: 45 minutes, questions after. Delivery: live.
Brand: default (must also render in nocturne). Tone: plain, concrete, confident.

## Audience

| Who | What they already know | What they care about | What they need from this talk | Likely objection |
| --- | --- | --- | --- | --- |
| A developer deciding whether to adopt it | MDX, React, Vite, coding agents | Diffable decks, agents that do not break them, exports | Proof that the checks are real and the authoring loop is short | "Generated slides always look generated" |
| A designer deciding whether to allow it | Brand systems, slide templates | The brand surviving other people's decks | Proof that authors cannot go off brand and text cannot overflow unseen | "Code decks ignore the brand" |

Primary audience: the developer, who will run it first; the designer's sign-off is what they need to win.

## Outcome

After this, a developer or designer will run `pnpm deckster new` on a real talk because they now believe a deck can be content in files, checked by a linter, in a brand nobody can break.

## Big idea

A slide is a file with a claim and its evidence; the brand owns every pixel and a linter measures the rendered result, so an agent can write a deck a designer would sign off.

## Evidence

| Claim the talk needs | Source |
| --- | --- |
| 63 layouts, 19 charts and figures, 7 diagram components, 42 lint rules, 776 shared icon names | `pnpm deckster layouts --summary`, `charts --json`, `diagrams --json`, `lint --help`, `icons` in this repository |
| What lint, shot, export, comments, present and the agent host do | The package READMEs and docs/ in this repository |
| Terminal output on slides | Copied from real runs of the CLI against this deck |
| Halden's review rounds, hours, findings | Fictional, labelled illustrative on each slide |
