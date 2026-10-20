# AI-INTERACTION

## The problem
SOCIA's AI features must be trusted, editable and predictable:
- Generate Caption
- AI comment replies
- Make This Video
- Plan These Posts
- the Today card
- the MCP connection

## Approaches seen
- **Framer** [observed]:
  - The agent narrates real steps with elapsed time ("Created a design plan · 2s").
  - The result comes as named alternatives side by side.
  - Starter chips are offered, and "Start without AI" is always available.
  - The AI page teaches through example prompts grouped by job, each with a copy button.
- **Higgsfield** [observed and measured]:
  - The cost sits on the Generate button and updates live ("—" when unknown).
  - Smart defaults are named "Auto".
  - Every gallery result shows its recipe (prompt and details) with a "Recreate" action.
  - The empty state is a three-step tutorial.
- **Metricool** [observed in marketing imagery]:
  - After generating, the panel offers bounded one-click transforms (shorter, add a CTA, change tone, translate).
  - The remaining credits show in the panel header.
  - The MCP page lists every tool with a one-line description and example questions.
- **ElevenLabs** [described on marketing pages]:
  - The AI draft stays an editable document with an obvious manual path.
  - Status text uses a restrained shimmer only while visible.

## Comparison
- **All four agree** that AI output is a draft, not a verdict, and that the next action must be visible.
- **They differ in how much process to show:**
  - Framer shows the steps.
  - Metricool shows the transforms.
  - Higgsfield shows the recipe.
- **SOCIA's differentiator** is verified context (claim checker, real data), so showing *what the AI used* (Higgsfield's recipe idea and Framer's real steps) fits best. Metricool's transforms suit captions and replies.

## SOCIA today
- Generate Caption has verified context and a claim checker.
- Comments drafts can be approved, skipped or redrafted ("Another"), and spam gets a suggest-skip.
- Plan loop and Studio flows exist.
- Settings → AI Assistants lists the connection steps.

## Recommendation
- **Long jobs:** a real step list from backend stages ("Read your last 30 posts"), with timings. Never fake progress.
- **Results:** 2–3 labelled options where it helps, with the manual path one click away.
- **Captions and replies:** one-click transforms, with the claim checker rerun after each.
- **Metered actions:** show the allowance or "—" on the action button.
- **Settings → AI Assistants:** list SOCIA's MCP tools (read vs posting), plus 4–6 example prompts with copy buttons.
- **Learn from a result:** "What was used" sits beside any AI or performance result, with "Use as starting point".
