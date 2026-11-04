// Static imports so Remotion's bundler ships the files. Voice clips are the
// processed ones in audio/vo/ (trimmed, 1.2x, peak-limited); raw takes stay in audio/vo/raw/.
import vo00 from "./audio/vo/00.mp3";
import vo01 from "./audio/vo/01.mp3";
import vo02 from "./audio/vo/02.mp3";
import vo03 from "./audio/vo/03.mp3";
import vo04 from "./audio/vo/04.mp3";
import vo05 from "./audio/vo/05.mp3";
import vo06 from "./audio/vo/06.mp3";
import vo07 from "./audio/vo/07.mp3";
import whooshShort from "./audio/sfx/whoosh-short.mp3";
import whoosh from "./audio/sfx/whoosh.mp3";
import pop from "./audio/sfx/pop.mp3";
import clickSoft from "./audio/sfx/click-soft.mp3";
import riser from "./audio/sfx/riser.mp3";
import impact from "./audio/sfx/impact-bass-1.mp3";

export const VO_FILES: Record<string, string> = {
  "00": vo00, "01": vo01, "02": vo02, "03": vo03, "04": vo04, "05": vo05, "06": vo06, "07": vo07,
};

export const SFX_FILES: Record<string, string> = {
  "whoosh-short": whooshShort,
  whoosh,
  pop,
  "click-soft": clickSoft,
  riser,
  "impact-bass-1": impact,
};

