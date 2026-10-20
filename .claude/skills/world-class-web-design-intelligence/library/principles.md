# What the library has learned

The synthesis across all references. "Show me what you've learned" reads from here. Update it whenever a principle recurs across references or one reference has an unusually strong solution.

**Library as of 2026-10-19:** 6 references: Metricool, Apple, ElevenLabs, Framer, EnduroSat, Higgsfield. App screens behind logins (Metricool, ElevenLabs, Framer, Higgsfield) are thin; see INDEX.md.

## Recurring principles

1. **Few weights; hierarchy comes from size steps and text-colour steps.**
   - **Evidence:**
     - Apple: 2 weights (400/600) across ~48 named roles, and 12 sizes.
     - ElevenLabs: 400/500, with headings *lighter* (300) but larger.
     - Framer: 342 of 347 pricing text nodes at 400; white at 100/80/60/40%.
     - Higgsfield: 4 weights on a 12/14/16/20 core.
     - EnduroSat configurator: 2 weights.
   - **Mechanism:** when weight is held constant, every size or contrast step reads as deliberate. Text-colour steps survive theme changes.
   - **SOCIA gap:** 8 weights (500 to 800) and 10 sizes between 9 and 13.5px (baseline).
   - **Caution:** Framer's weight-400 titles scan weakly in dense lists [Framer weaknesses]. A dense app needs a clear label/heading weight.

2. **One accent, reserved for action or state; everything else in the chrome is neutral, so colour means data.**
   - **Evidence:**
     - Apple (blue only on links, CTAs, selection, focus)
     - ElevenLabs (black actions; colour only in charts and avatars)
     - Framer (accent almost absent from the chrome)
     - Higgsfield (lime = act/selected)
     - EnduroSat (cyan = active; orange only for "the old way")
     - Metricool (a strict two-colour core)
   - **Mechanism:** a scarce accent becomes information, and the eye finds it first.
   - **SOCIA:** already the rule (purple = action). Extend it: no tinted cards or coloured section headers; chart series and status are the only other colour.

3. **Radius grows with element size.**
   - **Evidence:**
     - Apple: 5 / 8 / 12 / 18 / 28
     - ElevenLabs: pills for controls, then 12 / 16 / 20 / 24
     - Higgsfield: 4 / 8 / 10–12 / 16 / 20
     - Framer marketplace: 5 / 8 / 16 / 18 / 20
   - **Mechanism:** nested corners look related.
   - **SOCIA gap:** a loose 6 / 8 / 9 / 10 / 12 / 14 set.

4. **Surfaces separate by fill steps and hairlines, with almost no shadows.**
   - **Evidence:**
     - Apple: no shadows on product or compare pages.
     - Metricool: zero shadows, 1px outlines.
     - Framer: inset 8–10% hairlines.
     - EnduroSat: no shadows at all.
     - Higgsfield: inset highlights.
     - ElevenLabs: 0.5px rings.
   - **Mechanism:** fewer edges make calmer, denser screens.
   - **SOCIA:** already mostly subtle shadows. Keep it that way, and drop the coloured primary-button glow shadows.

5. **Motion uses named tokens: fast for colour, a little slower for movement, exits faster than entrances, never replayed.**
   - **Evidence:**
     - Apple: 0.24 / 0.32s; exit at most 0.24s with no delay; no re-stagger between menus.
     - ElevenLabs: 0.15s colour, 0.3s transform.
     - Framer marketplace: fast .1 / base .15 / slow .2.
     - Higgsfield: fast / normal / slow / slower tokens, plus the same ease-out-quart SOCIA uses.
   - **Mechanism:** timing follows what the person is doing; speed is respect for a tool used daily.
   - **Counter-example:** EnduroSat's 0.45–0.8s weighty easing suits a marketing story, not an app.
   - **SOCIA gap:** 0.15 / 0.18 / 0.2 / 0.25s used interchangeably.

6. **Unknown is shown as unknown ("—", `--:--`), never as 0 and never silently hidden.**
   - **Evidence:**
     - Higgsfield: `GENERATE —` when the cost can't be computed.
     - ElevenLabs: `--:--` and a disabled Play button.
     - Framer: the baseline lift is "—".
     - EnduroSat: "—" until the prerequisite is set.
     - Apple: an aligned dash plus screen-reader "Not available".
     - Metricool: no % without an equal prior period.
   - **Metricool's weakness:** it shows "0" for unconnected networks and hides sections with no data.
   - **SOCIA:** already its rule. Add Apple's screen-reader text, and never hide a section silently.

7. **Show the consequence at the point of decision.**
   - **Evidence:**
     - Higgsfield: cost on the Generate button, updating live.
     - Apple: a sticky running total, and price deltas inside options.
     - EnduroSat: one slider recalculates every readout, chart marker and timeline.
     - Framer: the credit-tier select reprices the plan.
     - Metricool: best times painted into calendar slots.
     - ElevenLabs: a live recommended plan.
   - **Mechanism:** no translate-and-remember step; cause and effect teach the model by feel. This is where "futuristic" comes from: behaviour, not decoration.

8. **Progressive disclosure driven by the person's own choice.**
   - **Evidence:**
     - Higgsfield: the preset rewrites the form.
     - Apple: later steps visible but locked; nested options only inside the selected card; constraints stated in collapsed summaries.
     - EnduroSat: gated steps; collapsed sections show their chosen values.
     - Metricool: one shared caption, with an opt-in split per network.
     - ElevenLabs: the selected row reveals its action.
   - **Mechanism:** each decision stays small, and the form never asks for something this output can't use.

9. **Translate abstract units into the outcomes people think in.**
   - **Evidence:**
     - ElevenLabs: credits become minutes, with "everything in X, plus".
     - Higgsfield: credits become "~80 videos", with an expected-usage meter.
     - Framer: credit tiers in the plan card.
     - Metricool: named units ("per brand/month") and "uses AI credits or included" per feature.
   - **SOCIA:** meters should read as outcomes ("about N videos a month").

10. **Tabular numbers for anything that changes or lines up.**
    - **Evidence:** ElevenLabs (times), Framer (`tnum` in mocks).
    - **Counter-example:** EnduroSat's lack of it makes live figures jitter.
    - **SOCIA:** apply `font-variant-numeric: tabular-nums` to every metric and time readout.

11. **The legend lives in the numbers.**
    - **Evidence:**
      - Metricool: the KPI card is also the legend and the series toggle.
      - EnduroSat: a coloured dash in the KPI label, a marker on the curve, and the nearest tick in bold.
    - **Mechanism:** proximity and shared colour remove the lookup step.

12. **AI shows its work, offers named alternatives, and always leaves a manual path.**
    - **Evidence:**
      - Framer: real steps with elapsed time, named explorations, and "Start without AI".
      - ElevenLabs: AI output stays an editable draft.
      - Metricool: bounded one-click transforms instead of a blank prompt.
      - Higgsfield: every result shows the recipe that produced it, with "Recreate".
    - **SOCIA:** fits its verified-context and claim-checker approach. Keep the steps real (never fake progress).

## Standout solutions
- **Apple's configurator** steps through choices: visible locked steps, absolute prices at the top level, deltas inside a choice, constraints stated in collapsed summaries, "Need help choosing?" next to each decision, and a sticky running total. This is the model for SOCIA's Create Post composer and onboarding.
- **Apple's Compare page:** self-labelling cells (value over caption) remove the label column, so 2 columns fit at 375px. The selection lives in the URL and the tab title. This is the model for All brands and Competitors.
- **EnduroSat's chapter progress** compresses the past (done chapters become filled marks), expands the present (labelled segments), and lets you click any segment. This is the model for multi-step flows (onboarding connect, Make This Video, Plan These Posts).
- **Metricool's best times are painted into the calendar slots.** The insight sits where the decision is made. SOCIA must add the source and sample size, which Metricool hides.
- **Higgsfield puts the cost on the commit button,** with "—" when unknown, and lets the chosen preset decide the form.
- **ElevenLabs:**
  - The thumbnail is the play control, with a progress ring and one shared player.
  - The selected row cross-fades its label into its action in the same slot.
  - Transcript words have three states.
- **Framer's winner row:** the winner at full contrast, the others muted but kept, and the baseline shown as "—".

## Where references disagree
- **How many weights in dense UI.** Framer and ElevenLabs lean on 400 almost everywhere; Apple uses 400/600; Higgsfield 400–700. For a dense analytics app, pure-400 titles scan weakly. **For SOCIA:** 3 weights. A proposal, not yet decided (see below).
- **Comparison tables on phones.** Framer, ElevenLabs and Metricool show one plan at a time with a switcher. Apple keeps 2 columns side by side using self-labelling cells. **For SOCIA:** Apple's approach where comparison is the task (All brands, Competitors). One-at-a-time is acceptable for a 4-plan pricing table.
- **Motion character.** EnduroSat is slow (0.45–0.8s, weighty). Apple, Framer, ElevenLabs and Higgsfield are fast (0.1–0.32s). **For SOCIA:** fast, because it's a daily tool.
- **Pills.** Apple, ElevenLabs and Higgsfield use pill CTAs. SOCIA forbids giant pill buttons. **For SOCIA:** pills only for chips, toggles and badges; buttons follow the radius scale.
- **Plan recommendation input.** Higgsfield and ElevenLabs ask about needs (what and how much you make). **For SOCIA:** use the person's *measured* usage when it exists, ask about needs only for new visitors, and never invent numbers.
- **Marketing site vs app.** Metricool, ElevenLabs, Framer and Higgsfield all run two design systems. This is common rather than a defect, but SOCIA should decide it deliberately (its homepage uses Geist and a blue pill CTA; the app uses Inter and purple).

## Proposed improvements (not yet decided: each needs Noah's go-ahead and solves a stated problem)
| # | Problem in SOCIA today | Proposed approach | Sources |
|---|---|---|---|
| 1 | Hierarchy is muddy: 10 sizes within 4.5px, 8 weights (baseline) | About 6 size tokens with tracking baked in, and 3 weights (400 body, 500 labels/names, 600 headings and key numbers). Hierarchy comes from `--text-primary/secondary/muted`. System-wide through tokens. | Apple, ElevenLabs, Framer, Higgsfield |
| 2 | Radii and durations drift (6/8/9/10/12/14px; 0.15/0.18/0.2/0.25s) | A radius rule (chips 6, controls 8, cards 12, popovers and dialogs 16; pills only for chips and toggles), plus fast/base/slow duration tokens on SOCIA's existing ease-out-quint. Exits faster than entrances. | Apple, Higgsfield, Framer, ElevenLabs |
| 3 | The posting-time insight lives away from where posts are scheduled | Tint Calendar slots and the composer's time picker by SOCIA's best-time windows, labelled with the source and post count. No tint, plus a reason, when history is thin. | Metricool (+ SOCIA's honesty rule) |
| 4 | Analytics tiles and charts need a separate legend; deltas need context | KPI tile = legend = series toggle. % only with an equal prior period; hover shows the absolute change and the compared dates. A formula or definition sits by derived metrics. | Metricool, EnduroSat |
| 5 | The composer asks for everything at once | The platform and format choice decides which fields appear; format chips sit inline in the destination row; settings are label-over-value tiles with named defaults ("Auto · Tue 6pm"); collapsed panels summarise their choices; a sticky summary. | Higgsfield, Metricool, Apple, EnduroSat |
| 6 | Unknowns are visible but not announced; numbers jitter | Keep "—", add screen-reader reason text, and apply `tabular-nums` to every metric and time. | Apple, ElevenLabs, Framer |
| 7 | AI flows (Make This Video, Plan These Posts, Generate Caption) can feel like black boxes | Real step list with timings, 2–3 named options, the manual path one click away, and the allowance or "—" on the action button where metered. | Framer, Higgsfield, ElevenLabs |
| 8 | Plan limits are abstract | Meters shown as outcomes, a cumulative "everything in X, plus" line, one source of truth for limit copy, and a usage counter at the point of action ("2 of 5 brands"). | ElevenLabs, Higgsfield, Metricool |

## Decisions for SOCIA
| Problem | Approach adopted | Sources | Why this one | How SOCIA adapted it | Date |
|---|---|---|---|---|---|
| (none yet: proposals above await Noah) | | | | | |
