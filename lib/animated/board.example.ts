// A worked storyboard, shown to the writer as an example of the language (not
// as a format to copy): a climbing app's "their beta isn't your beta" story.
// Also the fixture the engine is checked against.
const START = { x: 540, y: 492, lean: 0, lh: "h1", rh: "h2", lf: "f1", rf: "f2", o: 1 };
const REACH = { x: 520, y: 460, lean: -16, lh: "crux", rh: "h2", lf: "f1", rf: "f2", o: 1 };
const FALLEN = { x: 560, y: 636, lean: 8, lh: "", rh: "", lf: "", rf: "", o: 1 };
const HIGH_FOOT = { x: 532, y: 450, lean: -6, lh: "h1", rh: "h2", lf: "f1", rf: "hf", o: 1 };
const TWIST = { x: 500, y: 405, lean: -26, lh: "h1", rh: "h2", lf: "f3", rf: "hf", o: 1 };
const SENT = { ...TWIST, x: 498, y: 400, lean: -27, lh: "crux" };
const k = (ph: number, dt: number, pose: object, o?: number) => ({ at: { ph, dt }, ...pose, ...(o == null ? {} : { o }) });

export const EXAMPLE_BOARD = {
  phrases: [
    { text: "You watched their beta.", em: "beta" },
    { text: "You copied every move.", em: "every move" },
    { text: "And you still can't reach.", em: "can't reach" },
    { text: "Same holds. Same move.", em: "" },
    { text: "That reach just isn't there for you.", em: "for you" },
    { text: "BetaTwin scans the wall", em: "BetaTwin" },
    { text: "and builds the beta around your body.", em: "your body" },
    { text: "High foot. Twist the hip.", em: "High foot Twist hip" },
    { text: "Now it's there.", em: "there" },
    { text: "Their beta isn't your beta.", em: "your beta" },
  ],
  chapters: [{ ph: 0, label: "Their beta · 190 cm climber" }, { ph: 1, label: "Your try · 175 cm" }, { ph: 5, label: "BetaTwin · your beta" }],
  example: "Example heights",
  counter: { label: "Tries", steps: [{ at: { ph: 1, dt: 0.4 }, value: 1 }, { at: { ph: 3, dt: 0 }, value: 2 }, { at: { ph: 4, dt: 0 }, value: 3 }, { at: { ph: 4, dt: 1.7 }, value: 4 }], goodAt: { ph: 8, dt: 0.6 } },
  meter: { label: "Forearm pump", keys: [{ at: { ph: 0, dt: 0 }, value: 12 }, { at: { ph: 1, dt: 0 }, value: 16 }, { at: { ph: 5, dt: 0 }, value: 86 }, { at: { ph: 8, dt: 0.6 }, value: 86 }, { at: { ph: 8, dt: 1.6 }, value: 52 }], goodAt: { ph: 8, dt: 0.6 } },
  set: { floor: true, panels: true, spots: true, scatter: 70 },
  points: [
    { name: "f1", x: 450, y: 690, draw: "hold", tone: "dim" }, { name: "f2", x: 610, y: 690, draw: "hold", tone: "dim" }, { name: "f3", x: 430, y: 615, draw: "hold", tone: "dim" },
    { name: "h1", x: 415, y: 200, draw: "hold", tone: "dim" }, { name: "h2", x: 668, y: 218, draw: "hold", tone: "dim" },
    { name: "hf", x: 640, y: 530, draw: "hold", tone: "dim" }, { name: "crux", x: 240, y: 135, draw: "hold", tone: "dim" },
  ],
  figures: [
    { id: "them", scale: 1, tone: "fg", keys: [k(0, 0, START), k(0, 0.45, START), k(0, 1.35, { ...REACH, y: 437, lean: -15 }), k(1, 0, { ...REACH, y: 437, lean: -15 }), k(1, 0.3, { ...REACH, y: 437, lean: -15 }, 0.3), k(5, 0, { ...REACH, y: 437, lean: -15 }, 0.3), k(5, 0.4, { ...REACH, y: 437, lean: -15 }, 0)] },
    { id: "you", scale: 0.92, tone: "fg", keys: [
      k(1, 0, START, 0), k(1, 0.25, START), k(1, 1.4, REACH), k(2, 0.3, REACH), k(2, 0.8, FALLEN), k(2, 1.3, FALLEN),
      k(3, 0, START), k(3, 0.6, REACH), k(3, 0.9, REACH), k(3, 1.3, FALLEN), k(3, 1.6, FALLEN),
      k(4, 0, START), k(4, 0.5, REACH), k(4, 0.7, REACH), k(4, 1.1, FALLEN), k(4, 1.3, FALLEN), k(4, 1.7, START), k(4, 2.2, REACH),
      k(5, 0, REACH), k(5, 0.5, START), k(7, 0, START), k(7, 0.6, HIGH_FOOT), k(7, 0.8, HIGH_FOOT), k(7, 1.6, TWIST), k(8, 0, TWIST), k(8, 0.5, SENT),
    ] },
  ],
  shapes: [],
  tags: [
    { text: "Their beta, 190 cm", tone: "dim", x: 820, y: 150, from: { ph: 1, dt: 0.3 }, to: { ph: 5, dt: 0 } },
    { text: "High foot", tone: "accent", x: 830, y: 540, from: { ph: 7, dt: 0 }, to: { ph: -1, dt: 0 } },
    { text: "Twist hip", tone: "accent", x: 250, y: 480, from: { ph: 7, dt: 0.8 }, to: { ph: -1, dt: 0 } },
  ],
  markers: [{ label: "1", point: "hf", at: { ph: 6, dt: 0.4 } }, { label: "2", point: "f3", at: { ph: 6, dt: 0.65 } }, { label: "3", point: "crux", at: { ph: 6, dt: 0.9 } }],
  stamps: [{ text: "Sent", tone: "accent", x: 300, y: 60, at: { ph: 8, dt: 0.6 } }],
  links: [{ figure: "you", hand: "lh", point: "crux", label: "Out of reach", tone: "bad", from: { ph: 1, dt: 1 }, to: { ph: 5, dt: 0 } }],
  cards: [],
  sweep: { from: { ph: 5, dt: 0.5 }, to: { ph: 5, dt: 1.6 } },
  flash: { ph: 5, dt: 0 },
  end: { eyebrow: "Get early access", title: ["Want in", "early?"], rows: [{ icon: "chat", a: "Comment “BETA”", b: "for early access" }, { icon: "follow", a: "Follow + comment", b: "to join the waitlist" }, { icon: "send", a: "Send this to the friend", b: "who can reach everything" }] },
};
