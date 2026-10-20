# NAVIGATION

## The problem
Inside SOCIA's sidebar app, people need to know where they are in a page and in a flow, while each page keeps one clear primary action.

## Approaches seen
- **Apple** [measured]:
  - The 44px global bar scrolls away; a 52px sticky local bar (title, sub-pages, one compact action) takes over.
  - The current sub-page has three redundant cues: full opacity, an underline, and it isn't clickable.
  - Every top-level menu uses one overlay template.
- **EnduroSat** [measured and observed]:
  - Chapter progress: done chapters collapse to filled marks, the current one expands with labelled segments, and any segment can be clicked.
  - Sticky section anchors with scroll-spy.
  - **Cost:** on phones the bar covers content.
- **ElevenLabs** [measured]: a quiet step line ("Select a voice › Generate speech"), with the current step in primary and the next in tertiary.
- **Framer** [measured]:
  - A scroll-spy icon rail (active at full opacity, inactive at 0.5).
  - Journey-ordered marketing menus.
  - A signed-in shortcut from the marketing site to the dashboard.
- **Higgsfield** [measured]: a 22-item top bar mixing modes, models and promotions. This is the anti-pattern.
- **Metricool** [observed]: a full-screen mobile marketing menu with the auth buttons pinned to the thumb zone.

## Comparison
- **For in-app page context,** Apple's sticky local header is the strongest (one bar, the most relevant scope, one action).
- **For flows,** EnduroSat's compressing progress and ElevenLabs' quiet step line serve different weights: use the progress bar for 4+ step flows and the step line for 2–3 step micro-flows.
- Higgsfield shows what happens without discipline.

## SOCIA today
- A dark navy sidebar (SideNav, 17px icons), page headers with tabs (Analytics: Overview, Content Performance, Audience, Posting Times, Growth).
- Content Studio phases and the onboarding scan steps.

## Recommendation
- **Sticky page header** on long pages: title, tabs, one primary action. On phones the tabs collapse behind a chevron and the action stays (at 40px or more).
- **Current tab:** primary text colour, a 2px underline, `cursor: default`.
- **One popover anatomy** for the workspace switcher, bell, user menu and create menu.
- **Multi-step flows:** a compressing progress indicator driven by step state (done = `--primary`, current = labelled, future = muted).
- **2–3 step micro-flows:** a one-line step indicator.
- The sidebar stays as it is.
