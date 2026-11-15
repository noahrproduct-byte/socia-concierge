// Whether credit top-ups can be bought right now. Server only (reads env).
//
// Top-ups open once Stripe checkout is on and both packs have a one-off
// Stripe Price (STRIPE_PRICE_TOPUP_SMALL, STRIPE_PRICE_TOPUP_LARGE). Since
// every AI feature runs on credits (2026-11-15) they no longer wait for Scale
// to go on sale.
import { checkoutAvailable } from "@/lib/plans";
import { TOPUP_PACKS, type TopupKey } from "./config";

export const topupPriceId = (key: TopupKey): string | null =>
  process.env[`STRIPE_PRICE_TOPUP_${key.toUpperCase()}`]?.trim() || null;

export const topupsOpen = (): boolean => checkoutAvailable() && TOPUP_PACKS.every((p) => Boolean(topupPriceId(p.key)));
