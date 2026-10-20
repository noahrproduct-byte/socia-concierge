# EDITOR

## The problem
SOCIA has two editing surfaces:
- the **Create Post composer** (platforms, media, caption, schedule, per-platform settings)
- **Content Studio's clip builder** (play, cut, captions, look & sound)

Both should ask only for what matters to the chosen output, and make previewing instant.

## Approaches seen
- **Higgsfield: the chosen preset decides the form.**
  - Picking a preset rewrites the panel's fields and the cost.
  - The picker opens in place of the results while the form stays visible, with its state in the URL.
  - Options carry spec chips. [observed and measured]
- **Metricool: format chosen where the network is chosen.**
  - A format chip (Reel, Short) sits inline in each network row.
  - One shared caption, with an opt-in split per network. [observed in marketing imagery]
- **Apple: nested choices appear only inside the selected option.**
  - Constraints from earlier choices are stated in the collapsed summary.
  - A sticky running summary. [measured]
- **EnduroSat: the preview follows the section being edited.** Collapsed sections show their chosen values. [observed]
- **ElevenLabs (component kit):**
  - The thumbnail is the play control (progress ring, one shared player).
  - The waveform doubles as the scrubber.
  - Transcript words have three states: spoken, current, unspoken.
  - Times read `--:--` until known. [measured]

## Comparison
- **All four composers agree on progressive disclosure tied to the person's choice.** They differ in where the choice lives:
  - Higgsfield: a preset card at the top.
  - Metricool: inline in the destination row.
  - Apple: a stepped flow.
- **For SOCIA's composer,** the destination row is where the platform is already chosen, so Metricool's inline format chip is the closest fit. Higgsfield's rule (the choice decides the fields) supplies the logic, and Apple's sticky summary and constraint text supply the safety.

## SOCIA today
- **Composer:** DestinationPicker, MasterContent, PlatformTabs, PreviewRail, MediaSection, per-platform settings forms (Instagram, YouTube), and Trial Reel and collaborator options.
- **Content Studio:** ClipBuilder with Player, Cut, Text & captions, and Look & sound (100ms RMS windows already measured).

## Recommendation
- **Composer:**
  - A format chip per selected destination.
  - The platform and format decide which fields render (hide what doesn't apply).
  - Settings as label-over-value tiles with named defaults ("Auto · Tue 6pm" from history, or a labelled placeholder).
  - Collapsed panels summarise their values.
  - A sticky summary of platforms, time and approval status.
  - The preview follows the platform being edited.
- **Clip builder:**
  - Thumbnail-as-play with one shared player.
  - A waveform scrubber drawn from the real RMS windows.
  - Current-word highlight using the AssemblyAI timestamps.
  - `—:—` until a duration is known.
