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
    k.app ? "For an app: other apps and software products in the same space, including a founder's or creator's account that sells its OWN app (a link to the app, the app's screens in its videos). Look especially for ones whose Reels are animated or motion-graphics product videos, screen walkthroughs and feature explainers: videos they can make for themselves. Example: for an AI app for Instagram growth, vidIQ, Metricool, Predis.ai, OpusClip, and a founder posting animated explainers of his own AI growth app." : "",
    ownStyle ? `Among those, accounts whose videos are made the same way as theirs (${ownStyle}) come first.` : "",
  ].filter(Boolean).join("\n");
}

/**
 * What the fit check is told, from Noah's examples (docs/discover/examples.json):
 * for SOCIA, an AI app for Instagram growth, the right competitors were vidiq,
 * metricool, predis.ai, opusclip and jayantcreates.ai (a founder selling his
 * own app, ootto.ai); nick_saraev (a creator showing AI tools on screen) was
 * right for Reels but sells no app; eight marketing coaches were wrong.
 */
export function fitRules(k: BrandKind): string {
  if (!k.business) {
    return [
      "competitor: a creator or brand in the same niche, making content for the same audience.",
      "niche: an account in a neighbouring subject whose videos this creator could adapt.",
    ].join("\n");
  }
  if (k.app) {
    return [
      `competitor: ${competitorWords(k)} in the same space, or a founder's or creator's account that sells or shows its OWN app (a link to the app, the app's screens in its videos). Example: an AI app for Instagram growth competes with vidIQ, Metricool, Predis.ai, OpusClip and a founder posting about his own AI growth app.`,
      "niche: does not sell an app, but its videos show apps or AI tools in action (screens, animated demos), so its Reels are worth copying. Example: a creator who demos Claude and other AI tools.",
      "off: coaches, educators, consultants, agencies and influencers giving general marketing or growth tips with no product on screen, personal-life content, and anything on an unrelated subject.",
    ].join("\n");
  }
  return [
    `competitor: ${competitorWords(k)}: the official account of a product or business like this one.`,
    "niche: not a business like this one, but its videos are about the same subject and worth copying.",
    "off: coaches, educators, consultants, agencies and influencers who only talk about the topic, and anything on an unrelated subject.",
  ].join("\n");
}

/**
 * Where Discover's viral Reels come from besides competitors. A business that isn't an app copies Reels
 * from the same kind of business ANYWHERE (Noah, 2026-11-16, on Salvo's Pizza: "it doesn't have to be
 * competitors in Nashville, it can just be any restaurant that got good views"): "kind". An app or a
 * creator with a set video style copies that style on any topic (moe.dev for SOCIA): "style".
 */
export type ViralSource = "kind" | "style";
export function viralSource(k: BrandKind, ownStyle: string | null): ViralSource | null {
  if (k.business && !k.app) return "kind";
  return ownStyle ? "style" : null;
}
