# Clip examples: teaching SOCIA's clipper what a good clip is

`examples.json` holds clips Noah has judged. Every clip pick (lib/clipper/socia.ts) reads them
and follows what they show, alongside each brand's own posted-clip results and the niche's
leading hooks and topics.

Each entry:

```json
{
  "verdict": "good",
  "transcript": "The words spoken in the clip, exactly.",
  "seconds": 34,
  "why": "Opens on the result before explaining it; ends on the payoff.",
  "niche": "restaurants"
}
```

- `verdict`: `good` or `bad`.
- `why`: one or two sentences in Noah's words. This is what the picker learns from.
- `niche` is optional.
- For another creator's clip, `transcript` is a short description of what is said, not their words.

To add one, send the clip (or a link to it) with your verdict and why. Claude transcribes it
and adds the entry. Keep the list to the clearest 20 or so: the picker reads up to 12, good
and bad mixed.
