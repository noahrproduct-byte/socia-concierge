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
