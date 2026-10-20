# SEARCH-COMMAND

## Approaches seen
- **Apple** [observed]: search opens in the same overlay template as the menus and shows quick links before anything is typed.
- **ElevenLabs** (component kit) [measured]: a searchable picker with an inline preview control:
  - name at 14px/500
  - a 12px meta line of three attributes separated by "•"
  - a check mark only on the selected option
  - **Cost:** raw API values leak into the meta line ("middle_aged").

## Recommendation for SOCIA
- **A future command palette:** 4–6 zero-query destinations ("Schedule a post", "Today", "Connect TikTok").
- **Account, brand and competitor pickers:** searchable, with a name line plus a muted meta line, and the check on the selected option only.
- **Always humanise raw values** before display.

## Added from the logged-in apps (2026-10-19)
- **ElevenLabs ⌘K:**
  - 720px wide.
  - Empty, it shows Quick actions (icon tile, title, one-line subtitle) and Recent.
  - Typing searches actions plus three content types, grouped and **capped at five per group**.
  - Only the highlighted row shows "Open ↵".
  - The first Escape clears the query, the second closes it.
  - **Weaknesses:** Enter on a typed query starts an AI chat by default, and relevance is loose. [measured]
- **Framer Quick actions (⌘K):**
  - 330px wide, with grouped sections (Project, Plugins) and the first row pre-highlighted.
  - Shortcuts right-aligned; 40px rows (taller than menu rows) to fit icons. [measured]
  - The main menu has its own "Type to search…" field.
  - **Unavailable commands are dimmed, not hidden.** [measured]

## Updated recommendation
- **SOCIA ⌘K, empty:** Create (post, plan, video), Go to (sections), Workspace (switch brand) and Recent.
- **When typing:** search posts, accounts, brands and actions, grouped and capped.
- **AI:** "Ask SOCIA about '<query>'" is a labelled option, never the Enter default.
- **Unavailable commands** are dimmed with a reason ("needs a connected account").
