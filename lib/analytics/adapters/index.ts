// Platform adapters — each maps one platform's raw, already-fetched data into
// the normalized NormalizedAccountAnalytics bundle. Fetching stays in the
// existing lib/* sync/data modules; adapters are pure normalization so they are
// fully unit-testable without the network. The universal shell selects the
// adapter for a connected account's platform and renders only the bundle.
//
// TikTok has no adapter yet — its integration is a coming-soon slice (see
// lib/analytics/capabilities: connectable=false). Do not add a TikTok adapter
// until the connect/sync path and approved credentials exist.

export { adaptInstagram, type InstagramAdapterInput } from "./instagram";
export { adaptYouTube, type YouTubeAdapterInput } from "./youtube";
export { adaptFacebook, type FacebookAdapterInput } from "./facebook";
