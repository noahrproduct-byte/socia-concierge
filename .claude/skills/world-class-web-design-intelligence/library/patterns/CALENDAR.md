# CALENDAR

## The problem
SOCIA's Calendar should make the right time obvious and show each post's true state.

## Approaches seen (only Metricool so far; compare as more references arrive)
### Metricool [observed in help docs and screenshots]
- **Best times painted into hour slots:** darker = better, per chosen network, with an optional % per slot.
  - **Cost:** it silently falls back to generic estimates when personal data is missing (explained only in the help centre).
- **Status taxonomy,** including "Published with warnings" (published but missing something, such as a collaborator).
- **Drag-to-reschedule with explicit constraints:** only pending or draft posts, only into future slots, gated by role.
- **Cards show two icons** (network + format).
- **A toolbar** with the time zone stated, search, range, filters, and a "Create view" control.

## SOCIA today
- A week view (CalendarBoard) with Published / Draft / Trial / failed states, an approvals tab ("Needs approval"), and "Optimal times, based on your audience" as a banner below the grid.
- Posting-time windows already exist in `lib/postingTimes`.

## Recommendation
- **Move the best-time insight into the grid:** tint empty slots in three `--primary-subtle` steps.
  - Caption: "From your last N posts".
  - No tint, plus a reason, when history is thin.
- **Add a "published with warnings" state** for partial success (collaborator dropped, Trial Reel parameters ignored), with the reason on hover.
- **Disallowed drops snap back** with an inline reason (past slot, already published, Member needs approval).
- **Cards:** a lucide format glyph (12px) beside the platform mark.

Wait for a second calendar reference before changing the layout itself.
