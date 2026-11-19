// The effects a scene can be (lib/studioClips/scenes.ts, kind "effect"): a
// treatment of the whole frame for a couple of seconds, on the word it is
// about. Most put something behind the person talking (the person is found
// in the picture and drawn again on top, as the graphics behind the person
// are); a few move the picture itself. Pure: ids, what each needs, bounds.

export const SCENE_FX = {
  ribbon: { label: "Ribbon depth", what: "The room dims, a glass ribbon winds behind the person, a frosted card sits behind the head and a line lands in front.", person: true, text: "Card title", lines: 3 },
  chat: { label: "Message bubbles", what: "Chat bubbles pop up behind the person, each after typing dots.", person: true, text: "First message", lines: 3 },
  notify: { label: "Notification stack", what: "Phone notifications drop in from the top, behind the person.", person: true, text: "First notification", lines: 3 },
  search: { label: "Typed search", what: "A search bar types out what is being looked for.", person: true, text: "What is typed", lines: 0 },
  button: { label: "Button click", what: "A button in a field of rings; a cursor glides in and clicks it.", person: true, text: "Words on the button", lines: 0 },
  compare: { label: "Side by side", what: "Two glass cards: one option, then the other, which lights up.", person: true, text: "First option", lines: 0 },
  title: { label: "Title card", what: "A big stacked title with an accent bar, behind the person: for the hook or a new section.", person: true, text: "Title", lines: 0 },
  bars: { label: "Value bars", what: "Bars that grow to their numbers, one per thing compared.", person: true, text: "What is compared", lines: 4 },
  table: { label: "Table", what: "A small table whose rows slide in.", person: true, text: "Heading", lines: 4 },
  flow: { label: "Flow", what: "Steps joined by a line that draws through them, with a tick on the last.", person: true, text: "First step", lines: 3 },
  code: { label: "Code window", what: "A dark window where lines type themselves in.", person: true, text: "Window title", lines: 4 },
  keys: { label: "Key caps", what: "Keyboard keys that press one after another.", person: true, text: "Keys, with + between", lines: 0 },
  stamp: { label: "Stamp", what: "One word slammed on like a rubber stamp.", person: true, text: "Word", lines: 0 },
  comment: { label: "Comment keyword", what: "\"Comment\" and the word to comment, typed into a comment box.", person: true, text: "Word to comment", lines: 0 },
  orbit: { label: "Hub", what: "One thing in the middle with the things around it circling it: a system, a toolkit, everything in one place.", person: true, text: "The middle", lines: 4 },
  link: { label: "Link", what: "Two things joined by a line that draws between them, with a tick where they meet.", person: true, text: "First thing", lines: 0 },
  picker: { label: "Picker", what: "A list of options; the highlight runs down it and lands on the one chosen.", person: true, text: "The one chosen", lines: 3 },
  filedrop: { label: "File drop", what: "A file glides into a drop area, which fills and ticks.", person: true, text: "File name", lines: 0 },
  name: { label: "Name reveal", what: "A name spelled out letter by letter over a line, with who they are above it.", person: true, text: "Name", lines: 0 },
  doc: { label: "Document", what: "A page with a title, and a marker that highlights its key lines.", person: true, text: "Page title", lines: 3 },
  canvas: { label: "Open canvas", what: "The video becomes a layer in a design file: a selection frame on a drafting grid, and a cursor dragging its corner.", person: false, text: "Layer name", lines: 0 },
  cover: { label: "Magazine cover", what: "A masthead word across the top, behind the person.", person: true, text: "Masthead word", lines: 0 },
  glass: { label: "Glass text", what: "One big see-through word behind the person.", person: true, text: "Word", lines: 0 },
  graph: { label: "Graph rise", what: "A line chart climbing behind the person, with a tag on its peak.", person: true, text: "Tag on the peak", lines: 0 },
  news: { label: "News wall", what: "Headline clippings behind the person.", person: true, text: "First headline", lines: 3 },
  paper: { label: "Paper cut-out", what: "The person cut out with a white edge on a paper collage.", person: true, text: "Cut-out letters", lines: 0 },
  sketch: { label: "Sketch outline", what: "A hand-drawn line that wobbles around the person, with doodles.", person: true, text: "", lines: 0 },
  dolly: { label: "Dolly zoom", what: "The person pushes toward the camera while the room stays still.", person: true, text: "", lines: 0 },
  frame: { label: "Frame pop", what: "The video pops into a framed card.", person: false, text: "Line under the frame", lines: 0 },
  reveal: { label: "Pull-out reveal", what: "The video pulls back into a window.", person: false, text: "Window title", lines: 0 },
  phone: { label: "Phone frame", what: "A phone slides in behind the person with a few lines on its screen.", person: true, text: "Title on the screen", lines: 3 },
} as const;
export type SceneFxId = keyof typeof SCENE_FX;
export const SCENE_FX_IDS = Object.keys(SCENE_FX) as SceneFxId[];
export const isSceneFx = (v: unknown): v is SceneFxId => typeof v === "string" && Object.prototype.hasOwnProperty.call(SCENE_FX, v);
/** The effects that draw the person again on top. */
export const fxNeedsPerson = (id: SceneFxId): boolean => SCENE_FX[id].person;
export const FX_TEXT_MAX = 28;
export const FX_LINE_MAX = 48;
export const MAX_EFFECTS = 4;

/** The sound a scene lands with, when the cut has sound on its graphics: which file, how long it runs, and how many frames after the scene starts. Synthesised originals from Motus's style packs (MIT). */
export function sceneSound(kind: string, fx: SceneFxId | undefined): { src: string; frames: number; delay: number } {
  const at = (name: string, sec: number, delay = 0) => ({ src: `/editor-sfx/m-${name}.m4a`, frames: Math.ceil(sec * 30) + 2, delay });
  if (fx === "stamp") return at("hit", 0.37, 6);
  if (fx === "button") return at("click", 0.18, 36);
  if (fx === "keys" || fx === "search" || fx === "code" || fx === "comment") return at("click", 0.18, 8);
  if (fx === "notify" || fx === "chat" || fx === "link" || fx === "filedrop") return at("ping", 0.25, 6);
  if (fx === "frame" || fx === "reveal" || fx === "canvas" || fx === "dolly") return at("boom", 0.6);
  if (!fx && kind === "stat") return at("pop", 0.09, 2);
  return at("swish", 0.34);
}
