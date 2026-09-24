import { describe, it, expect } from "vitest";
import { PLATFORMS } from "./types";
import {
  CAPABILITIES,
  availableMetrics,
  connectablePlatforms,
  hasTrueSeries,
  isCrossPlatformAdditive,
  isMetricAvailable,
  metricLabel,
  platformCapability,
} from "./capabilities";
import { facebookFormat, instagramFormat, normalizeFormat, youtubeFormat } from "./format";

describe("capability registry — completeness", () => {
  it("has an entry for every platform", () => {
    for (const p of PLATFORMS) expect(platformCapability(p)).toBeTruthy();
  });
});

describe("capability registry — honesty guards", () => {
  it("Facebook never exposes post views (never faked)", () => {
    expect(isMetricAvailable("facebook", "views")).toBe(false);
    expect(CAPABILITIES.facebook.metrics.views).toBeUndefined();
  });

  it("Facebook exposes no demographics", () => {
    expect(CAPABILITIES.facebook.demographics).toEqual([]);
  });

  it("Facebook has no reach (advanced permission not requested)", () => {
    expect(isMetricAvailable("facebook", "reach")).toBe(false);
  });

  it("Instagram exposes age, gender and city demographics", () => {
    expect(CAPABILITIES.instagram.demographics).toEqual(["age", "gender", "city"]);
  });

  it("YouTube exposes watch time; Instagram and Facebook do not", () => {
    expect(isMetricAvailable("youtube", "watch_time")).toBe(true);
    expect(isMetricAvailable("instagram", "watch_time")).toBe(false);
    expect(isMetricAvailable("facebook", "watch_time")).toBe(false);
  });

  it("YouTube exposes no shares or saves on its scopes", () => {
    expect(isMetricAvailable("youtube", "shares")).toBe(false);
    expect(isMetricAvailable("youtube", "saves")).toBe(false);
  });

  it("TikTok claims nothing until its integration lands", () => {
    expect(CAPABILITIES.tiktok.connectable).toBe(false);
    expect(Object.keys(CAPABILITIES.tiktok.metrics)).toHaveLength(0);
  });

  it("only Instagram, YouTube and Facebook are connectable today", () => {
    expect(connectablePlatforms().sort()).toEqual(["facebook", "instagram", "youtube"]);
  });
});

describe("capability registry — labels", () => {
  it("labels YouTube audience as Subscribers, others as Followers", () => {
    expect(metricLabel("youtube", "followers")).toBe("Subscribers");
    expect(metricLabel("instagram", "followers")).toBe("Followers");
    expect(metricLabel("facebook", "followers")).toBe("Followers");
  });

  it("labels YouTube posts as Videos", () => {
    expect(metricLabel("youtube", "posts")).toBe("Videos");
  });
});

describe("capability registry — levels and true series", () => {
  it("Instagram series metrics exclude derived-only engagement rate", () => {
    const series = availableMetrics("instagram", "series");
    expect(series).toContain("views");
    expect(series).toContain("reach");
    expect(series).toContain("followers");
    expect(series).not.toContain("engagement_rate");
  });

  it("true-series gate: IG views is a real daily series, IG engagement is not", () => {
    expect(hasTrueSeries("instagram", "views")).toBe(true);
    expect(hasTrueSeries("instagram", "engagement")).toBe(false);
  });

  it("YouTube subscriber level has no stored history yet, but net subscribers is a real series", () => {
    expect(hasTrueSeries("youtube", "followers")).toBe(false);
    expect(hasTrueSeries("youtube", "net_followers")).toBe(true);
  });

  it("isMetricAvailable respects the level filter", () => {
    expect(isMetricAvailable("instagram", "views", "series")).toBe(true);
    expect(isMetricAvailable("instagram", "views", "content")).toBe(true);
    expect(isMetricAvailable("instagram", "reach", "content")).toBe(false);
  });
});

describe("cross-platform additivity", () => {
  it("sums additive counts but not ratios or levels", () => {
    expect(isCrossPlatformAdditive("views")).toBe(true);
    expect(isCrossPlatformAdditive("watch_time")).toBe(true);
    expect(isCrossPlatformAdditive("engagement")).toBe(true);
    expect(isCrossPlatformAdditive("engagement_rate")).toBe(false);
    expect(isCrossPlatformAdditive("followers")).toBe(false);
    expect(isCrossPlatformAdditive("reach")).toBe(false);
  });
});

describe("format normalization", () => {
  it("maps Instagram media types", () => {
    expect(instagramFormat("VIDEO")).toBe("reel");
    expect(instagramFormat("CAROUSEL_ALBUM")).toBe("carousel");
    expect(instagramFormat("IMAGE")).toBe("photo");
    expect(instagramFormat(undefined)).toBe("post");
  });

  it("classifies YouTube shorts by duration, live by flag, else video", () => {
    expect(youtubeFormat({ durationSec: 30 })).toBe("short");
    expect(youtubeFormat({ durationSec: 600 })).toBe("video");
    expect(youtubeFormat({ liveBroadcastContent: "live" })).toBe("live");
    expect(youtubeFormat({ durationSec: null })).toBe("video");
  });

  it("maps Facebook status types", () => {
    expect(facebookFormat("added_photos")).toBe("photo");
    expect(facebookFormat("added_video")).toBe("video");
    expect(facebookFormat("shared_link")).toBe("link");
    expect(facebookFormat(null)).toBe("post");
  });

  it("dispatches by platform", () => {
    expect(normalizeFormat("instagram", "VIDEO")).toBe("reel");
    expect(normalizeFormat("youtube", null, { durationSec: 20 })).toBe("short");
    expect(normalizeFormat("facebook", "added_photos")).toBe("photo");
  });
});
