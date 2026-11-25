# Evaluations

`evals.json` carries the task prompts and expectations inherited from earlier runs. They are test inputs, not evidence of a successful run.

These are development material for maintaining the skill, not part of what a user needs. Several cases use fixtures and commands from the deckster repository (`pnpm deckster`, its `showcase` deck, its `nocturne` and `default` brands); run them from a checkout of that repository, where `skills/` is the skill folder, and read `pnpm deckster` as `deckster`. They were written against an earlier repository-bound version of the skill and still assume it.

Run each selected case with two fresh agents: one given this skill's absolute path, and a baseline without access to the skills folder (`skills/`, or the `.claude/skills` and `.agents/skills` links to it). Give both the same prompt, source fixtures, tools and framework snapshot. Keep graders and expected answers out of executor context.

Use independent temporary repository copies for builds. Preserve current source changes when creating the copies; do not evaluate against a stale Git checkout. Install dependencies separately or share them read-only, and never let parallel runs mutate a shared lockfile or dependency tree. Resolve `files` entries relative to this skill directory before passing them to an agent.

Save each run's output, command logs, screenshots, and measured timing under an external directory such as `<temporary-directory>/<skill>/iteration-1/eval-<id>-<name>/{with_skill,without_skill}/outputs`. Keep results, briefs and grading notes outside the repository. Do not manufacture token counts or treat missing renders as successful checks.

Grade every expectation from the actual artifacts, with `text`, `passed` and `evidence` in `grading.json`. For render cases, verify lint output and inspect the images. Compare with the baseline and identify failures that both configurations share. A single run per case is a smoke comparison, not a reliable estimate of variance or overall skill quality. Use the skill-creator benchmark aggregator and review viewer when available.

Cases 1–7 exercise intake, outlines, narrative and data-slide decisions; cases 8–11 require complete rendered decks (case 11 checks that evidence builds in steps); case 12 is an outline that checks the layout chosen for each pitch job (a screen, a competitor map, a market size, a customer's result, the team, the ask); case 13 is one rendered chart slide with placed elements (a badge and a source line) and case 14 an outline whose title-then-photo opening should use `image-reveal`. Cases 2 and 6 provide a compact outline-plus-render smoke run. The one-slide cases (6 and 13) require an isolated deck fixture, since the prompts do not name an existing deck.

`trigger-evals.json` contains 22 selection cases. Test them in fresh agent contexts with only skill names and descriptions available, and inspect whether the skill was actually loaded. A classifier prediction is only a routing sanity check, not a measured invocation rate. A trigger runner built for one agent does not test another.

Run the deterministic read-through tests:

```sh
python3 -I -m unittest discover -s skills/create-presentation/scripts/tests
```
