// Who counts as a competitor, by kind of account (Discover training, Noah,
// 2026-11-16). First round: SOCIA is an app, and its first search returned
// eight social media coaches and educators. Noah: "none of these are good
// since this is an app ... other apps that are kinda similar or post similar
// videos (animated videos that I can copy)". The examples live in
// docs/discover/examples.json.
//
// So a business competes with businesses of the same kind (an app with other
// apps, a café with other cafés); coaches, educators, agencies and influencers
// who only talk about the topic are competitors for creators, not businesses.
// Used by the research prompt (lib/discoveryRun.ts) and the niche-fit check
// (lib/discoverStyleLoad.ts judgeFit). Pure and browser-safe.

export type BrandKindInput = {
  accountType?: string | null;
  name?: string | null;
  niche?: string | null;
  /** What they offer or talk about, a description, anything the person wrote about the brand. */
  about?: (string | null | undefined)[];
};

export type BrandKind = {
  /** A business or organisation competes with its own kind; a creator or personal brand with other creators. */
  business: boolean;
  /** An app, software product or online tool. */
  app: boolean;
};

const APP_WORDS = /\b(apps?|software|saas|platform|tool|tools|plugin|extension|api|startup)\b/i;

export function brandKind(b: BrandKindInput): BrandKind {
  const business = b.accountType == null || b.accountType === "business" || b.accountType === "organization";
  const text = [b.name, b.niche, ...(b.about ?? [])].filter(Boolean).join(" ");
  return { business, app: business && APP_WORDS.test(text) };
}

/** The kind of competitor in words, for the prompts: "other apps and software products". */
export function competitorWords(k: BrandKind): string {
  if (!k.business) return "other creators in the same niche";
  if (k.app) return "other apps and software products";
  return "other businesses of the same kind";
}

/**
 * What the research prompt says about who to look for. For a business: the
 * brand accounts of its own kind, never people who only talk about the topic;
 * for an app, apps whose Reels are animated product videos first.
 */
export function researchRules(k: BrandKind, ownStyle: string | null): string {
  if (!k.business) {
    return `They are a creator, so their competitors are other creators in this niche: accounts making content for the same audience, whose formats they could adapt.${ownStyle ? ` Creators whose videos are made the same way as theirs (${ownStyle}) come first.` : ""}`;
  }
  const kind = competitorWords(k);
  return [
    `They are a business, so their competitors are ${kind}: the brand accounts of products or businesses like theirs, ideally solving a similar problem for a similar customer.`,
    "Coaches, educators, consultants, agencies and influencers who only talk about the topic are NOT competitors for a business. Leave them out, however popular they are.",
    k.app ? "For an app, look especially for apps whose Reels are animated or motion-graphics product videos, screen-recorded walkthroughs and feature explainers: those are videos they can make for themselves." : "",
    ownStyle ? `Among those, accounts whose videos are made the same way as theirs (${ownStyle}) come first.` : "",
  ].filter(Boolean).join("\n");
}

/** What the niche-fit check is told about who fits. */
export function fitRules(k: BrandKind): string {
  if (!k.business) {
    return "The account fits when it is a creator or brand in the same niche, or makes content for the same audience.";
  }
  return [
    `The account fits only when it is itself one of ${competitorWords(k)}: the official account of a product or business like this one.`,
    "Coaches, educators, consultants, agencies and influencers who only talk about the topic do NOT fit, even in the same niche.",
  ].join(" ");
}
