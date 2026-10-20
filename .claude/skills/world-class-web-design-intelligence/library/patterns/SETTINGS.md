# SETTINGS

## Approaches seen
- **Framer** [observed]: roles are shown as the capabilities they grant (Design → canvas, Content → CMS, Deploy → publish).
- **EnduroSat** [observed]: collapsed sections summarise their chosen values, so the stack of headers reads as a record of decisions.
- **Metricool** [observed]: usage counters sit at the point of action ("Brands 1 of 15"), with an explainer inset where a concept first matters.

## Recommendation for SOCIA
- **Settings → Members:** each role lists what it can do (submit, approve and schedule, publish), so the approval rules are visible when the role is assigned.
- **Collapsed sections** summarise their state.
- **Limit counters** sit beside "Add brand", "Add competitor" and "Invite".
- **A section anchor list** on the long Settings page.

## Added from the logged-in apps (2026-10-19)
- **ElevenLabs:**
  - Settings are one column of rows: a title, the current value in muted text, and one right-aligned action (Manage, See details). No inline forms; editing happens in a focused sheet. Destructive actions come last, in red. [measured]
  - Collapsed slider settings become "Stability … 50% ›", the same shape as other value rows. [measured]
- **Framer:**
  - The left nav is grouped by scope (site, hosting, per page).
  - Each page has a title, a one-line description and its action on the title row.
  - **Every tab is a deep link** (`?view=settings:usage:credits`), and Plans can open pre-scoped to one feature. [measured, app code]
- **Metricool:** the account menu separates brand-level items (connections, brand settings) from account-level ones (users, billing) with a divider. [observed]
- **Higgsfield:** the settings list leads with the workspace name. A Usage page with date presets, summary tiles, a share bar and a ledger (filters in the column headers). [measured]

## Updated recommendation
- **Group SOCIA Settings by scope:** Account, Workspace and brand, Connections, Plan and usage.
- **Each setting is a row:** label, current value, one action. Editing opens a focused sheet.
- **Every tab gets a URL,** so `upgradeFor` and "fix this" links land on the exact section.
- **Add Settings → Usage** for AI meters (see BILLING.md).
- **Destructive rows** come last, styled as danger.
