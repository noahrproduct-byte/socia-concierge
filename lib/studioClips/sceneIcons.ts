// The small icons a graphic scene can carry (lib/studioClips/scenes.ts): a
// plain line drawing in the cut's accent that says what the figure or the
// line is about (money, time, people, a place). SOCIA picks one from the
// words on the card, by rule; the person can change it or take it off.
// Drawn here as shapes on a 24 by 24 grid (components/studio/remotion/SceneLayer.tsx
// strokes them), so they render the same in the Player and the export. Pure.

export type IconShape = { d: string } | { c: [number, number, number] } | { r: [number, number, number, number, number] } | { p: string };
export const SCENE_ICONS = {
  money: { label: "Money", shapes: [{ d: "M12 2v20" }, { d: "M17 7c0-2-2.200-3.500-5-3.500S7 5 7 7.300s2 3.200 5 4 5 1.700 5 4.200-2.200 3.700-5 3.700-5-1.300-5-3.500" }] },
  percent: { label: "Percent", shapes: [{ c: [7, 7, 2.6] }, { c: [17, 17, 2.6] }, { d: "M19 5 5 19" }] },
  time: { label: "Time", shapes: [{ c: [12, 12, 9] }, { d: "M12 7v5l3.500 2" }] },
  calendar: { label: "Calendar", shapes: [{ r: [3, 5, 18, 16, 2] }, { d: "M3 10h18M8 3v4M16 3v4" }] },
  people: { label: "People", shapes: [{ c: [9, 8, 3.2] }, { d: "M3 20c0-3.300 2.700-6 6-6s6 2.700 6 6" }, { c: [17.500, 9, 2.4] }, { d: "M17 14.200c2.500.400 4 2.600 4 5.300" }] },
  place: { label: "Place", shapes: [{ d: "M12 21s-7-6.200-7-11a7 7 0 0 1 14 0c0 4.800-7 11-7 11z" }, { c: [12, 10, 2.5] }] },
  phone: { label: "Phone", shapes: [{ r: [7, 2, 10, 20, 2.5] }, { d: "M11 18h2" }] },
  star: { label: "Star", shapes: [{ p: "12,3 14.8,8.9 21,9.7 16.4,14 17.6,20.3 12,17.2 6.4,20.3 7.6,14 3,9.7 9.2,8.9" }] },
  heart: { label: "Heart", shapes: [{ d: "M12 20s-8-5-8-10.500A4.500 4.500 0 0 1 12 7a4.500 4.500 0 0 1 8 2.500C20 15 12 20 12 20z" }] },
  shop: { label: "Shop", shapes: [{ d: "M5 8h14l-1 13H6L5 8z" }, { d: "M9 8V6a3 3 0 0 1 6 0v2" }] },
  fire: { label: "Fire", shapes: [{ d: "M12 22c-3.900 0-7-2.900-7-6.800 0-3 2-5 3.500-7 .300 2 1.200 3 2.300 3.300C10.300 8.500 11 5 13.500 2c.500 3.500 5.500 6 5.500 12.200 0 4.300-3.100 7.800-7 7.800z" }] },
  delivery: { label: "Delivery", shapes: [{ r: [2, 7, 11, 9, 1] }, { d: "M13 10h4l4 4v2h-8z" }, { c: [7, 18, 2] }, { c: [17, 18, 2] }] },
  food: { label: "Food", shapes: [{ d: "M7 2v8a2 2 0 0 0 4 0V2M9 10v12" }, { d: "M17 2c-2 2-3 4.500-3 7.500V13h3zM17 13v9" }] },
  growth: { label: "Growth", shapes: [{ d: "M3 17l6-6 4 4 8-8" }, { d: "M15 7h6v6" }] },
  home: { label: "Home", shapes: [{ d: "M3 11l9-8 9 8" }, { d: "M5 10v10h14V10" }, { d: "M10 20v-6h4v6" }] },
} as const satisfies Record<string, { label: string; shapes: readonly IconShape[] }>;

export type SceneIconId = keyof typeof SCENE_ICONS;
export const SCENE_ICON_IDS = Object.keys(SCENE_ICONS) as SceneIconId[];
export const isSceneIcon = (v: unknown): v is SceneIconId => typeof v === "string" && Object.prototype.hasOwnProperty.call(SCENE_ICONS, v);

/** The first rule that matches wins, so the narrower ones come first. */
const RULES: [SceneIconId, RegExp][] = [
  ["percent", /%|\bpercent\b/i],
  ["money", /[$£€]|\b(dollars?|bucks|cents|price|prices|cost|costs|cheap|money|paid|pay|sale|discount|revenue|profit)\b/i],
  ["delivery", /\b(delivery|deliver|delivered|shipping|ship|shipped)\b/i],
  ["phone", /\b(call|phone|text us|dm|message us)\b/i],
  ["place", /\b(location|locations|street|corner|downtown|address|city|town|miles?)\b/i],
  ["food", /\b(food|burgers?|pizza|menu|eat|taste|fresh|kitchen|dish|dishes|meals?|calories)\b/i],
  ["people", /\b(people|customers|clients|followers|members|team|families|guests|students)\b/i],
  ["star", /\b(stars?|rated|rating|reviews?|best)\b/i],
  ["heart", /\b(love|loved|favorite|favourite)\b/i],
  ["fire", /\b(hot|fire|spicy|trending|viral)\b/i],
  ["shop", /\b(orders?|shop|store|buy|bought|stock|products?|items?|sold)\b/i],
  ["time", /\b(seconds?|minutes?|hours?|fast|faster|quick|quicker)\b/i],
  ["calendar", /\b(days?|weeks?|months?|years?|today|tomorrow|weekend|daily|weekly)\b/i],
  ["growth", /\b(grow|grew|growth|views|sales|increase|increased|double|doubled|triple|more)\b/i],
  ["home", /\b(home|house|houses)\b/i],
];

/** The icon the words on a card call for, or none. */
export function iconFor(text: string): SceneIconId | undefined {
  return RULES.find(([, rx]) => rx.test(text))?.[0];
}
