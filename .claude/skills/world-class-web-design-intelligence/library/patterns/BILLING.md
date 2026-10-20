# BILLING

## The problem
People should know what an action uses, and how close they are to a limit, before they hit it.

## Approaches seen
- **Higgsfield:** cost on the commit button, updated live. Signed in, the button is disabled with no price until the form is valid (the signed-out "—" was a loading artefact). An expected-usage meter appears on pricing. **Weakness:** Generate stays lime and enabled even when the balance can't cover the price. [measured]
- **Metricool:** a usage counter at the point of action ("Brands 1 of 15" beside "+ Add"); AI credits shown in the AI panel header. [observed]
- **ElevenLabs:** a recommended plan announced politely (`aria-live`). [measured]
- **Framer:** inline overage terms per limit row; one grace month plus an email (FAQ). [observed]

## Comparison
All four put the number **where the action is**, not on a separate billing page. That's the principle.

## SOCIA today
- Settings shows real meters.
- Upgrade CTAs come from `upgradeFor`.
- **Check:** whether counters appear beside "Add brand", "Add competitor" and the AI actions.

## Recommendation
- Counters beside the controls that consume a limit ("2 of 5 brands"). At the cap, the control explains the limit and the upgrade, instead of failing after a click.
- Metered AI actions show the remaining allowance on the button, or "—" when it can't be computed.

## Added from the logged-in apps (2026-10-19)
- **Cost before the click, beside the button:**
  - ElevenLabs' "prompt island" shows the next generation's cost and the balance ("N credits / M credits", or a rate × variants for music) next to the send button. [measured]
  - Framer's Localization panel footer shows used / limit with a 2px bar and an Upgrade button. [measured]
  - Metricool's composer AI panel shows the credits remaining. [observed]
- **Ambient balance, exact on demand:**
  - ElevenLabs' avatar wears a thin usage ring; its account menu opens with a Balance card (used / remaining, tabular) and Upgrade. [measured]
  - Higgsfield's account menu holds a Credits block with a "what drives cost" tooltip. [measured]
- **Contextual, non-destructive paywalls:**
  - Metricool marks gated controls with one consistent marker. Clicking opens "Unlock <tool>" with numbers for what the lowest qualifying plan includes, plus "Maybe later". [observed]
  - Higgsfield's plan sheet is titled with the gated choice, and closing it leaves the previous selection intact. [observed]
  - Framer's Plans page can be deep-linked per feature (`settings:plans:<feature>`). [from app code]
- **Limit as progress where it's spent:** Metricool's Planner banner reads "N out of your M posts this month". [measured]
- **Usage at three depths (Higgsfield):**
  1. a 30-day mini chart where zero days are dots, not missing bars
  2. summary tiles plus a share bar by feature
  3. a ledger with filters in the column headers, each charge linking to what it bought [measured]
- **Weakness seen in four apps:** upsell overload. Metricool has an upgrade button, section banners, lime controls and a watermark on one page. ElevenLabs has a strip, a modal, an in-panel card and a carousel. Higgsfield stacks a toast with the sheet. Framer keeps "Upgrade now" inside the canvas toolbar.

## Updated recommendation
- **Allowance:** next to every metered action, show what it uses from the real meter before the click. Disable the action, and say why, when the allowance can't cover it.
- **Account menu:** plan and this month's allowance, with a one-line "what counts" tooltip.
- **Upgrade sheet:** titled with the feature, quantified, with "Maybe later". Opened by `upgradeFor`, deep-linked, and never altering the current state.
- **Settings → Usage:** tiles, a share by feature, and a ledger.
- **One upgrade message at a time:** never in the work surface, never stacked.
