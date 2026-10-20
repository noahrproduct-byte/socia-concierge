# BILLING

## The problem
People should know what an action uses, and how close they are to a limit, before they hit it.

## Approaches seen
- **Higgsfield:** cost on the commit button, live, "—" when unknown; an expected-usage meter (`820/1,200`). [measured]
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
