// Which wording the "customers do something" goal gets for a brand (Noah,
// 2026-11-16: "if they have an app then it should be users, but if they have
// an actual business, for example a restaurant, then bookings and orders").
// Decided from what the person confirmed about the brand: how their customers
// act when they said so, otherwise the words in the niche and the account's
// own description. When nothing points anywhere it stays "bookings or orders".
// Pure and browser-safe.
import type { CustomerAction, CustomerGoalId } from "./growth";

const BY_ACTION: Partial<Record<CustomerAction, CustomerGoalId>> = {
  sign_up: "users",
  book: "bookings_orders",
  visit: "bookings_orders",
  buy_online: "sales",
  call: "clients",
  enquire: "clients",
};

// Checked in this order: software first (a "food delivery app" is an app),
// then places people book or order from, then shops, then services.
const RULES: [CustomerGoalId, RegExp][] = [
  ["users", /\b(apps?|software|saas|platforms?|plug-?ins?|browser extension|web ?apps?|mobile games?|video games?|ai tools?|ai assistant|waitlist|sign-?ups?|subscribers?|newsletter|community|membership)\b/i],
  ["bookings_orders", /\b(restaurants?|pizzerias?|pizza|cafes?|cafés?|coffee shops?|bars?|bakery|bakeries|diners?|food trucks?|catering|takeaway|salons?|barbers?|spas?|gyms?|studios?|clinics?|dentists?|hotels?|tours?|venues?|reservations?)\b/i],
  ["sales", /\b(shops?|stores?|boutiques?|e-?commerce|clothing|apparel|jewell?ery|merch|skincare|cosmetics|handmade|products?)\b/i],
  ["clients", /\b(agency|agencies|coach|coaching|consult\w*|freelanc\w*|photograph\w*|videograph\w*|real estate|realtors?|lawyers?|law firm|accountants?|contractors?|trainers?|tutors?|services?)\b/i],
];

/**
 * The customer goal's wording for a brand. `action` is how the person said
 * their customers act (Growth Profile); `texts` are the brand's confirmed
 * niche, description and what it sells, most specific first.
 */
export function customerGoalFor(input: { action?: CustomerAction | null; texts: (string | null | undefined)[] }): CustomerGoalId {
  const byAction = input.action ? BY_ACTION[input.action] : undefined;
  if (byAction) return byAction;
  // The most specific text that says anything decides; a broad category only counts when nothing narrower does.
  for (const t of input.texts) {
    if (!t) continue;
    const hit = RULES.find(([, re]) => re.test(t));
    if (hit) return hit[0];
  }
  return "bookings_orders";
}
