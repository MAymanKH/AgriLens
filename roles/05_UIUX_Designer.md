# Role 5 | UI/UX Designer: All Three AgriLens Screens

> **Shared specification:** This file covers your full assignment. `START_HERE.md` is authoritative for approved region/crop/science decisions, API field names, error codes, and fallback rules; `AGENTS.md` covers change control. Examples below are development fixtures, not live scientific data. If a conflict appears, flag it to the Technical Lead before changing the contract.

> **Context:** AgriLens is a 48-hour NASA Space Apps prototype for comparing crop rotations in **one verified Egyptian region**. One prefilled farm has **four slots**: Year 1 summer, Year 1 winter, Year 2 summer, Year 2 winter. Users see their plan and **two valid alternatives**, compared by approximate seasonal crop-water needs, historical heat exposure, and qualitative crop-diversity/soil notes. The only app screens are Setup, Compare, and Details/Stress Test.
>
> **Timing:** `T+N` means **N hours after kickoff**. Target a working end-to-end demo by **T+22**, freeze new features at **T+30**, and finish the reviewed package by **T+36**, leaving the remaining time as contingency. No technology stack is prescribed.


## What this job actually means

Decide exactly **what the user sees, what they can click, and how to understand the result immediately**. Give the App Developer implementable screens by T+8, then keep improving the real app through the demo. You do not implement backend calculations or approve scientific facts.

**You own:** wireframes, final layouts, screen labels, styles/components, icons/visual assets, desktop/phone variants, all input/loading/error states, usability checks and presentation-ready screenshots.

## User flow you must design

`Screen 1 Setup -> Screen 2 Compare -> Screen 3 Details & historical stress test`, with **Edit choices** returning to Setup and **Back** returning to Compare. **Exactly three screens**, no login, landing page, dashboard, profile or settings.

### Screen 1 | Set up your farm

**Main question:** *What do I want to compare?*

- A clear title: **Compare crop rotations**, plus **at most one short explanatory sentence**.
- Region shown as the **one supported, preselected Egyptian sample region** (avoid a map selector).
- Four crop dropdowns grouped into **Year 1 Summer / Winter** and **Year 2 Summer / Winter**. Use only season-compatible crops; start with a valid example.
- One priority control with choices **Less water**, **Less heat exposure**, **More crop diversity**.
- One dominant **Compare rotations** button. Optional **Reset example** action.
- Invalid crop/season message **beside the input**; visible loading state when comparison is running; retained selections after errors.
- **No soil selector** unless the team has a checked reason for it to affect results.

**Handoff to App:** desktop + narrow/mobile layout, exact control labels, button target, disabled/error/loading states, sample copy.

### Screen 2 | Compare rotations

**Main question:** *How do the available options differ?*

- Compact header: **Region**, chosen priority, and **Edit choices**.
- Up to three options with stable identities: **Your rotation**, **Lower-water alternative**, **More-diverse alternative**. The approved demo sample must show all three; in other cases, design a clear one-card/two-card state without empty placeholders.
- Each option contains four crops in order, **approximate water-demand range with units**, **historical hot days with temperature threshold**, **one qualitative soil/diversity note**, and **one short reason**.
- Clear emphasis on the option best aligned with the priority **only when justified**. If options tie or evidence is incomplete, say so; never show a fake 'Best' badge.
- Single obvious next action: **See details & stress test**. On desktop use aligned columns; on phone stack the cards or use a visible labeled selector.
- No unexplained soil-health percentage, unsupported savings, or color-only status signals.

**Handoff to App:** desktop + mobile comparison layouts, metric hierarchy, card styling, source/missing-value treatment (`Not evaluated`), error/partial-data states.

### Screen 3 | Details & historical stress test

**Main question:** *Why, and how does the historical weather change the comparison?*

- A three-choice scenario control: **Historical average**, **Hottest recorded year**, **Driest recorded year**. Show the selected historical period/year clearly.
- A simple **returned-plans heat-exposure chart or compact table**, with axis/units/legend and the **heat threshold** visible.
- Short expandable explanations: **Why these options?**, **How NASA data was used**, and **Sources & limitations**. Each reason links to an actual source or rule.
- A warning that historical stress examples **are not forecasts**. Water values based on fixed crop estimates should remain unchanged between weather scenarios.
- **Back to comparison** and **Edit choices** navigation.
- If a scenario is unavailable, keep the previous valid results on screen and explain the problem without presenting stale numbers as new data.

**Handoff to App:** scenario switcher behavior, chart/table design, citation/link design, expansion states and error state. **Handoff to Presentation:** screenshots, one clean comparison visual, icons/logo if created.

## Specific failure-state designs

- On **Setup**, display a local explanation for invalid crop/season input; retain the user's choices on error or retry.
- On **Compare**, design one-card and two-card variants with an obvious message such as **"No other valid rotation found with these crops."** Never display a fake alternative merely to fill the grid.
- On **Details**, show disabled/unavailable scenarios and a small label **"Showing previous result: Historical average"** after a failed switch, with a Retry action. Unknown metrics display **Not evaluated**, not 0.
- Make the source/limitations link visible and text-specific; no "best" badge unless the result is defensible. Align these states with `START_HERE.md` and the App Developer.

## Tasks and checkpoints

- **T+0-3:** Draw basic wireframes for **all three screens** and agree on exact controls/copy with App and Lead. Focus on layout rather than decoration.
- **T+3-5:** Finish **Screen 1** desktop/mobile, including error and loading states. Hand it off immediately.
- **T+5-8:** Finish **Screens 2 and 3**, a compact style guide (typography, spacing, color, components) and chart specification. Send them to App; do not wait for final polish.
- **T+8-22:** Compare the working app against your designs. Test the full flow with **two people unfamiliar with AgriLens**; observe where they hesitate and give App a short, ranked fix list.
- **T+22-30:** Fix confusing labels, units, chart legends, mobile layouts and source visibility. Prepare presentation visuals. Freeze major redesigns at T+30.
- **T+30-36:** Final visual check of the app, slides and recorded demo; only fix issues that affect understanding.

## Proof you finished

Three screens with desktop and phone layouts, valid/invalid/loading/unavailable states, consistent controls, readable scientific labels and an explicit navigation map. At least two outsider tests show people can compare options and find limitations in under two minutes. The implemented app matches the handed-off designs.

## Starting references

- [Nielsen Norman Group: Progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/) - keep the main comparison short, with detail when requested.
- [W3C WAI: Form labels](https://www.w3.org/WAI/tutorials/forms/labels/) - controls that make sense without guessing.
- [GOV.UK: Error messages](https://design-system.service.gov.uk/components/error-message/) - errors that explain how to recover.
- [W3C: labels and instructions](https://www.w3.org/WAI/WCAG21/Understanding/labels-or-instructions) - accessible short guidance.
