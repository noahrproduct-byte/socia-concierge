# FORMS

## The problem
Choices with dependencies, where later options depend on earlier ones: onboarding/connect, the composer, Plan These Posts, plan selection, and Settings.

## Approaches seen
- **Apple's configurator** [measured]:
  - Every step is visible, but steps that aren't available yet are `disabled` at 0.42 opacity.
  - Step headings are two-tone: a noun plus an instruction, at one size.
  - Absolute price at the top level, a delta inside the chosen option.
  - Constraints from earlier choices are written into the collapsed summary.
  - "Need help choosing?" opens a small comparison dialog.
  - A sticky running total.
- **EnduroSat's configurator** [observed]:
  - Derived values show "—" until the prerequisite is set.
  - The next step stays dimmed, then fills with a stated default.
  - Collapsed accordion headers show their chosen values.
  - It starts with one question per screen (progressive commitment), then opens into a dense workspace.
- **Higgsfield** [measured]:
  - Label-over-value setting tiles ("Camera / Auto").
  - Counters show limits early ("References 0/50").
  - Option rows carry spec chips.
  - Example-first placeholders.
- **ElevenLabs:**
  - Disabled-until-valid submit.
  - Removable chips with 44px hit areas around a 12px icon. [measured]
- **Framer:**
  - Native selects for tier choice.
  - An early submit, made before the page is interactive, is queued rather than lost.
  - A honeypot field instead of a CAPTCHA. [measured]

## Comparison
- Apple and EnduroSat independently arrive at **"show the whole path, lock what isn't ready, summarise what's done"**.
- Apple adds the cost delta and the constraint text; EnduroSat adds the honest "—" and the stated default.
- Higgsfield's tiles make a long configuration readable in one glance.
- **Together** they form one consistent pattern rather than three competing ones.

## SOCIA today
- The composer shows sections at once.
- Defaults for the schedule time exist (best time, or a labelled placeholder per the plan-loop rules).
- **Check:** how disabled states and limit counters (5 hashtags, 5 collaborators) are shown today.

## Recommendation
**A single "dependent choices" pattern for SOCIA:**
- Later steps render but are disabled, using one `--disabled-opacity` token (around 0.45; Apple's 0.42 is too faint for content people need to read).
- A collapsed section summarises its values and states its constraints ("Up to 5 hashtags on Instagram").
- Defaults are named, never blank.
- Unknowns are "—".
- Limit counters are visible before the limit is reached.
- A "Need help choosing?" link sits beside real decisions (Trial Reel, plan).

## Added from the logged-in apps (2026-10-19)
- **Higgsfield:**
  - "Optional" tags, a 0/500 counter, and a Generate button disabled until the required input exists.
  - Switching the model rewrites the form completely, confirming that the choice decides the form. [measured]
- **ElevenLabs Text to Speech:**
  - Every setting is either explained in place (a tooltip on the label, named slider ends) or collapsed to "label … value ›".
  - The placeholder teaches the syntax with an inline example. [measured]
- **Metricool composer:** a split submit menu where each option carries a one-line consequence; the character counter names its binding constraint. [measured]
