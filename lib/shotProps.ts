// What is in a storyboard beat's shot, read from the plan's own words for it (Noah, 2026-11-23: the shot
// drawings were the same stick figure and phone grid for every idea; make them match the idea, at no cost).
// Up to three things named in the shot, in the order they're named, and any amount the beat itself states.
// Nothing is added that the beat doesn't say. Pure and browser-safe.

export type ShotProp =
  | "laptop" | "phone" | "desk" | "door" | "calendar" | "price" | "chart" | "feed" | "pizza" | "coffee" | "food"
  | "oven" | "gym" | "car" | "store" | "menu" | "money" | "camera" | "mic" | "book" | "clothes" | "hair"
  | "people" | "app" | "message" | "clock" | "cake" | "home";

const RULES: [ShotProp, RegExp][] = [
  ["laptop", /\b(laptop|computer|macbook|monitor|desktop)\b/i],
  ["phone", /\b(phone|iphone|mobile)\b(?! at| on a| propped)/i],
  ["desk", /\b(desk|workspace|office)\b/i],
  ["door", /\b(door|doorway|entrance)\b/i],
  ["calendar", /\b(calendar|schedule|(?:the|finished|weekly|week'?s|content|your) plan)\b/i],
  ["price", /\b(price|prices|pricing|cost|costs|\$\d)/i],
  ["chart", /\b(chart|graph|analytics|views|stats|numbers|results)\b/i],
  ["feed", /\b(instagram|feed|grid|reels|profile|posts)\b/i],
  ["pizza", /\b(pizza|slice|cheese pull)\b/i],
  ["coffee", /\b(coffee|latte|espresso|cup|mug)\b/i],
  ["food", /\b(dish|plate|meal|kitchen|food|burger|pasta|tacos?)\b/i],
  ["oven", /\b(oven|grill|stove|fire|flame)\b/i],
  ["gym", /\b(gym|workout|weights?|dumbbells?|squat|lift)\b/i],
  ["car", /\b(car|drive|driving)\b/i],
  ["store", /\b(store|shop|counter|storefront|till|register)\b/i],
  ["menu", /\b(menu|board|sign)\b/i],
  ["money", /\b(cash|money|payment|invoice|revenue)\b/i],
  ["camera", /\b(camera|tripod|lens)\b/i],
  ["mic", /\b(mic|microphone|podcast)\b/i],
  ["book", /\b(book|notebook|journal|notes)\b/i],
  ["clothes", /\b(outfit|shirt|clothes|dress|jacket)\b/i],
  ["hair", /\b(hair|haircut|salon|barber|scissors)\b/i],
  ["people", /\b(customers?|clients?|friends?|team|people|crowd|guests?)\b/i],
  ["app", /\b(app|dashboard|website|site|page|listing|socia)\b/i],
  ["message", /\b(dm|dms|message|comment|chat|text message)\b/i],
  ["clock", /\b(clock|timer|minutes?|hours?)\b/i],
  ["cake", /\b(cake|pastry|dessert|cookie|bakery)\b/i],
  ["home", /\b(home|room|bedroom|living room|couch)\b/i],
];

/** An amount the beat states ("$2,000/mo", "$450 a week"), as written; null when it states none. */
export function statedAmount(text: string): string | null {
  const m = /\$\s?\d[\d,]*(?:\.\d+)?\s?(?:k\b)?(?:\s?(?:\/|a|per)\s?(?:mo|month|wk|week|hr|hour|year|yr)\b)?/i.exec(text);
  return m ? m[0].replace(/\s+/g, " ").trim() : null;
}

/** Up to `max` things named in the shot, in the order the words name them. */
export function shotProps(show: string, max = 3): ShotProp[] {
  const found: { prop: ShotProp; at: number }[] = [];
  for (const [prop, re] of RULES) {
    const m = re.exec(show);
    if (m) found.push({ prop, at: m.index });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.prop).filter((p, i, a) => a.indexOf(p) === i).slice(0, max);
}
