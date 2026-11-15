// A storyboard video's voiceover (lib/animated/board.ts): what the voice says,
// and when each caption word is spoken, so the captions and everything on the
// stage follow the voice. The audio is made by ElevenLabs on the server
// (app/api/animated/voice) and lives only in the person's browser until the
// video is rendered there. Pure and browser-safe.
import type { Storyboard } from "./board";

export type BoardVoice = {
  /** A URL this browser can play (a blob: URL made from the audio the server sent). */
  url: string;
  /** When each caption word starts, in seconds, in caption order. */
  words: number[];
  /** When the voice stops, in seconds. */
  end: number;
  /** The captions it was made from: the voice is only used while the captions still read this. */
  text: string;
  voiceId: string;
  voiceName: string;
};

/** The most the voice is asked to say in one video. */
export const VOICE_MAX_CHARS = 1500;

const tidy = (s: string) => s.replace(/\s+/g, " ").trim();
const sentence = (s: string) => (s && !/[.?!]["”']?$/.test(s) ? `${s}.` : s);

/**
 * What the voice says: every caption in order, exactly as written, then the
 * ending card (its title and its first ask) while the card is up. `captions`
 * is the part the captions follow. Pure.
 */
export function voiceScript(board: Pick<Storyboard, "phrases" | "end">): { captions: string; closing: string; text: string } {
  const captions = board.phrases.map((p) => tidy(p.text)).filter(Boolean).join(" ");
  const ask = board.end.rows[0] ? tidy(`${board.end.rows[0].a} ${board.end.rows[0].b}`) : "";
  const closing = [tidy(board.end.title.join(" ")), ask].filter(Boolean).map(sentence).join(" ");
  const text = [sentence(captions), closing].filter(Boolean).join(" ");
  return { captions, closing, text: text.slice(0, VOICE_MAX_CHARS) };
}

type Alignment = { characters?: unknown; character_start_times_seconds?: unknown; character_end_times_seconds?: unknown } | null | undefined;

/**
 * When each caption word starts in the audio, from ElevenLabs' character
 * timings for the text that was sent. The timings are one per character of
 * that text; when they aren't (the service normalised the text), the words are
 * matched by order instead. Null when the captions can't be timed. Pure.
 */
export function wordStarts(text: string, captions: string, a: Alignment): { words: number[]; end: number } | null {
  const ch = Array.isArray(a?.characters) ? (a!.characters as unknown[]) : [];
  const st = Array.isArray(a?.character_start_times_seconds) ? (a!.character_start_times_seconds as unknown[]).map(Number) : [];
  const en = Array.isArray(a?.character_end_times_seconds) ? (a!.character_end_times_seconds as unknown[]).map(Number) : [];
  if (!ch.length || st.length !== ch.length || st.some((x) => !Number.isFinite(x))) return null;
  const want = captions.split(/\s+/).filter(Boolean);
  if (!want.length) return null;
  const end = Math.max(0, ...en.filter((x) => Number.isFinite(x)), st[st.length - 1]);
  let words: number[] = [];
  const sent = Array.from(text);
  if (sent.length === ch.length) {
    // One timing per character: each caption word starts where its first character does.
    let i = 0;
    for (let k = 0; k < want.length; k++) {
      while (i < sent.length && /\s/.test(sent[i])) i++;
      if (i >= sent.length) return null;
      words.push(st[i]);
      while (i < sent.length && !/\s/.test(sent[i])) i++;
    }
  } else {
    // Matched by order: the spoken words, split where the timings have a space.
    const starts: number[] = [];
    let inWord = false;
    ch.forEach((c, i) => {
      const space = typeof c !== "string" || /\s/.test(c);
      if (!space && !inWord) starts.push(st[i]);
      inWord = !space;
    });
    if (starts.length < want.length) return null;
    words = starts.slice(0, want.length);
  }
  // Never backwards, and to the hundredth of a second.
  for (let k = 1; k < words.length; k++) if (words[k] < words[k - 1]) words[k] = words[k - 1];
  return { words: words.map((x) => Math.round(x * 100) / 100), end: Math.round(end * 100) / 100 };
}

/** Whether a voice still matches the captions: it was made from these words, and has a time for each. Pure. */
export function voiceFits(board: Pick<Storyboard, "phrases" | "end">, voice: BoardVoice | null | undefined): voice is BoardVoice {
  if (!voice?.url || !Array.isArray(voice.words)) return false;
  const { captions } = voiceScript(board);
  return voice.text === captions && voice.words.length === captions.split(/\s+/).filter(Boolean).length;
}

/**
 * A voice as the picker shows it. The service names its stock voices like
 * "Bella - Professional, Bright, Warm" and describes them in a sentence; the
 * picker needs the name and a few words. Pure.
 */
export function voiceLabel(v: { name: string; description?: string | null }): { name: string; traits: string; label: string } {
  const [first, ...rest] = v.name.split(/\s+[-–—]\s+/);
  const name = (first || v.name).trim();
  // The traits after the name; without them, the opening clause of the description.
  const fromName = rest.join(", ").trim();
  const fromText = (v.description ?? "").split(/[.;:]|,?\s+(?:with|ready|perfect|great|ideal|that|who)\b/i)[0].replace(/^(this voice is|a|an)\s+/i, "").trim().split(/\s+/).slice(0, 4).join(" ");
  const traits = (fromName || fromText).replace(/\s+/g, " ").toLowerCase().split(/,\s*/).filter(Boolean).slice(0, 3).join(", ").slice(0, 48);
  return { name, traits, label: traits ? `${name} (${traits})` : name };
}
