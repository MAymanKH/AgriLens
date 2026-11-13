# Role 7 | Storytelling & Presentation: What Judges See

> **Shared specification:** This file covers your full assignment. `START_HERE.md` is authoritative for approved region/crop/science decisions, API field names, error codes, and fallback rules; `AGENTS.md` covers change control. Examples below are development fixtures, not live scientific data. If a conflict appears, flag it to the Technical Lead before changing the contract.

> **Context:** AgriLens is a 48-hour NASA Space Apps prototype for comparing crop rotations in **one verified Egyptian region**. One prefilled farm has **four slots**: Year 1 summer, Year 1 winter, Year 2 summer, Year 2 winter. Users see their plan and **two valid alternatives**, compared by approximate seasonal crop-water needs, historical heat exposure, and qualitative crop-diversity/soil notes. The only app screens are Setup, Compare, and Details/Stress Test.
>
> **Timing:** `T+N` means **N hours after kickoff**. Target a working end-to-end demo by **T+22**, freeze new features at **T+30**, and finish the reviewed package by **T+36**, leaving the remaining time as contingency. No technology stack is prescribed.


## What this job actually means

Own the **whole explanation of AgriLens**, not only a slide deck: problem story, pitch, slide structure, **video**, demo path, written project description, final files and fallback if the app is unavailable. You keep all presentation pieces consistent as the technical demo changes.

**You own:** `media/`, `docs/DEMO.md`, project summary, pitch script, deck, short video, screenshot/credits list, rehearsal and submission-readiness checklist. Technical developers own app functionality; Research approves scientific facts.

## One clear story for the judges

**Problem:** A farmer needs to choose a sensible crop sequence while facing water and heat risks.  
**Demo question:** "If I change my two-year crop rotation, what trade-offs should I expect?"  
**Action:** Select four seasonal crops and a priority, press **Compare**.  
**Result:** Show the starting rotation and two alternatives, with approximate water need, historic hot-day exposure, diversity notes and reasons.  
**Evidence/limits:** Explain which NASA POWER historical records are used and that this is a **decision-support comparison**, not a forecast or guaranteed farm outcome.

## Tasks and checkpoints

- **T+0-3:** Write the problem in plain words, pick one believable farmer/advisor story, draft a **60-90-second pitch**, and sketch the live demo flow through the three screens. Check the event's actual required formats/lengths; the plan intentionally gives **relative-hour milestones only**.
- **T+3-12:** Make the **slide outline and video storyboard in parallel**. Set up slide design and rough video narration while the app is being built. Ask UI/UX for a comparison visual and Research for approved data statements. Draft the written project description.
- **T+12-22:** Replace placeholders with the first real UI captures and **Research-approved** facts. Explain exactly where NASA data enters and why a viewer should care. Prepare a list of likely judging questions and a short fallback explanation if the app is temporarily offline.
- **T+22-30:** Produce final **slides and short video**, rehearse the live walkthrough, record a working backup demo, verify credits and permissions, and fix confusing parts of the story. Do not add new technical requirements late.
- **T+30-36:** Recheck all screenshots/figures against the real app, validate every public URL/file/share permission, verify the project page and submission materials, and confirm the full package is ready. Only fix factual, access or presentation blockers.

## Exact deliverables

| Item | What it contains | When useful |
|---|---|---|
| Slide deck | Problem and user, AgriLens solution, how it works, real three-way example, NASA data/source, trade-offs, limitations, team/credits | Outline T+12; ready T+30 |
| Short video | One farmer problem -> one app interaction -> three-option result -> what NASA data contributed; use **real screen capture** | Storyboard T+12; ready T+30 |
| Live demo script | Setup -> Compare -> Details/Stress Test in a predictable sequence, with cue lines and fallback route | Draft T+3; rehearsed T+30 |
| Project page | Plain-language description, screenshots, NASA and crop sources, code/demo/video links, credits and required disclosures | Draft T+12; checked T+36 |
| Judge Q&A | What is new? Why this region? Where is NASA used? Why those crops? How reliable are the results? What are the limits? | Ready T+30 |

**If three people share the role:** one leads **narrative and slides**, one makes **video/editing**, and one owns **demo/rehearsal/submission checks**. One presentation coordinator reviews all three so numbers and messages do not conflict.

## Story and demo fallbacks

- Use the **Research-approved three-plan sample** as the live walkthrough; demonstrate one actual, source-backed comparison rather than hypothetical savings. Reference the exact approved region/period from `START_HERE.md` once selected.
- Prepare a truthful backup recording and label it clearly as recorded. If an alternative is unavailable, explain the constraint; never crop the screen or modify a figure to make it look like a third real option.
- If historical data is incomplete or a scenario is unavailable, say so. Do not use "future climate prediction," a guaranteed irrigation benefit, or a numerical soil-health improvement claim.
- Before publishing, verify the project-wide **definition of done** in `START_HERE.md`, source credits, links, and Research sign-off for numerical claims.

## Quality checks and limits

- Every public number matches the app and has Research's approval. Do not claim guaranteed water savings, measured soil improvement, future forecast accuracy, yield or profit predictions.
- Make the NASA contribution **specific**: the weather inputs/period and their use in heat exposure or historical stress comparisons.
- A reviewer unfamiliar with agriculture should understand the problem, what to click, why three plans appear and what the limits are.
- Slides and video should work even if the public app is temporarily offline. Keep backups available.

## Useful references

- [Official Field Shift challenge](https://www.spaceappschallenge.org/2026/challenges/field-shift-adapting-farms-with-nasa-data/) - align the story with the problem statement.
- [NASA Space Apps participant resources](https://www.spaceappschallenge.org/resources/) - find current submission and project guidance.
- [NASA Space Apps legal/attribution](https://www.spaceappschallenge.org/legal/) - check source acknowledgments and media permissions.
