// lib/benchmarks.ts
//
// Measured 2026 short-form performance benchmarks, injected into every scoring
// prompt so the model cites real figures instead of inventing plausible ones.
//
// These numbers move. Re-verify roughly every six months and bump BENCHMARK_VERSION
// so stored ratings can be traced back to the rubric that produced them.
//
// Sources are listed at the bottom of this file.

export const BENCHMARK_VERSION = "2026.08";

export const BENCHMARKS = `PERFORMANCE BENCHMARKS (2026) — cite these figures, do not invent your own.

ENGAGEMENT RATE BY FOLLOWER TIER (Instagram Reels)
- Nano (1K-10K followers): 5-9%
- Micro (10K-100K): ~4.8%
- Mid (~400K): ~1.8%
- Mega (1M+): ~1%
Nano accounts see roughly 6x the engagement rate of mega accounts. NEVER compare an
account to a global average — compare it to its own tier. 3% is excellent at 500K
followers and unremarkable at 5K.

BY FORMAT (all tiers)
- Reels: 3.8% average
- Static feed posts: 1.2% average
Reels outperform feed posts by 80-120%.

HOOK AND RETENTION THRESHOLDS (the most important numbers here)
- Retention at 3 seconds must exceed 70%, or reach gets throttled.
- Hook drop delta (0s to 3s) must stay under 25%.
- 50-60% of all viewers who drop off do so in the first 3 seconds.
- 63% of the highest click-through TikTok videos hook the viewer inside 3 seconds.
- Healthy: ~60% retention at 15s, ~50% at 30s.
- Curve shapes: a "cliff" (30-50% loss in 3s) kills reach. A "plateau" (flat above
  70%) is the algorithm-favoured shape.

HOOK TYPES THAT PERFORM
Strongest three formulas in 2026: contrarian claim ("Stop using X for this"),
mistake warning ("You're doing X wrong"), list tease ("3 things nobody tells you").
Also strong: direct question, curiosity gap, statistic-led opener.
The best hooks combine two or three types.
PENALISE: greeting openers ("Hey guys"), throat-clearing ("So today I wanted to talk
about"), slow logo intros, any opening whose subject isn't clear within 3 seconds.

CAPTION LENGTH (from a 2026 study of 4,408 posts)
- 301-800 characters: 4.2% median engagement
- 126-300 characters: 3.94% median engagement
- Sweet spot is 126-800 characters. Hard limit 2,200.
- Only the first ~125 characters show before "... more" truncation, so the opening
  line must stand alone and earn the expand.
- CRITICAL: on REELS, caption length barely affects engagement. On FEED POSTS it
  matters a lot. Do not apply feed-post caption logic to a Reel.

HASHTAGS
- Instagram's own guidance is 3-5 targeted hashtags. The max is 30, but more tags do
  not increase visibility.
- 30 generic tags (#love, #photooftheday) reach an audience that won't engage, which
  LOWERS the reach score. Actively harmful, not merely useless.
- Never suggest #followforfollow, #like4like, #explorepage or similar bait.

ALGORITHM SIGNAL WEIGHTS (Instagram 2026, strongest first)
1. Sends / shares — the strongest signal Instagram has, above watch time and saves
2. Watch time
3. Saves — weighted meaningfully above likes
4. Meaningful comments
5. Likes — now the WEAKEST major signal
For discovery via Explore and Reels, shares dominate. The metric to optimise is
sends per reach.
SCORING IMPLICATION: a caption ending "double tap if you agree" optimises the weakest
signal available. A caption giving someone a reason to send it to a specific person
optimises the strongest. Score accordingly.

HOW TO USE THESE
- Anchor every score to a figure above or to specific words in the content.
- Be harsh. Most content is average by definition: 5-6/10 and 55-70/100 are normal.
  Reserve 85+ for content that beats a named benchmark, and say which one.
- Never predict view counts or exact engagement percentages. Express predictions as
  BANDS relative to the account's own median, or to its follower tier above.`;

/*
Sources:
- Engagement by follower tier — nowadays.media / apaya.com / iqfluence.io (2026)
- 3-second hook and retention thresholds — hansencommerce.com, aibrify.com, virvid.ai
- Caption length study (4,408 posts) — postplanify.com, socialinsider.io
- Algorithm ranking signals — later.com, buffer.com (2026)
- Hook formulas — opus.pro, vexub.com
*/
