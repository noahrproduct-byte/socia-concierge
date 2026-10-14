import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildContainerParams, buildTrialReelBody, createContainer, TRIAL_GRADUATION } from "../igPublish";
import { containerPlan, instagramAdapter, trialFailure } from "./adapters/instagram";
import { CAPABILITIES, pairState } from "./capabilities";
import { trialIssues, validateDestination } from "./validate";
import { trialLine, trialOf } from "./trial";
import type { PublishContext } from "./adapter";
import { defaultSettings, type ContentItem, type Destination, type InstagramSettings, type MediaItem } from "./types";

const now = new Date("2026-10-14T12:00:00Z");
const video: MediaItem = { id: "v1", kind: "video", name: "a.mp4", mime: "video/mp4", size: 40 * 1024 * 1024, width: 1080, height: 1920, duration: 28, path: "u/a.mp4", url: "https://cdn/a.mp4" };
const reel = (over: Partial<InstagramSettings> = {}): InstagramSettings => ({ ...defaultSettings("instagram"), format: "reel", ...over });
const trial = (share: "manual" | "if_performing" = "manual", over: Partial<InstagramSettings> = {}) => reel({ trial: { share }, ...over });

const dest = (settings: InstagramSettings, over: Partial<Destination> = {}): Destination => ({
  id: "d1", postId: "p1", platform: "instagram", accountId: "ig1", status: "uploading", scheduledAt: null, startedAt: null, publishedAt: null,
  externalPostId: null, externalContainerId: null, permalink: null, errorCode: null, errorMessage: null, retryCount: 0, nextRetryAt: null,
  settings, createdAt: now.toISOString(), updatedAt: now.toISOString(), ...over,
});
const item = (d: Destination): ContentItem => ({
  id: "p1", userId: "u1", caption: "New menu", media: [video], scheduledAt: null, status: "publishing", source: "composer", planId: null, planDay: null,
  publishedAt: null, createdAt: now.toISOString(), updatedAt: now.toISOString(), destinations: [d],
});
const supa = (row: unknown) => {
  const q: Record<string, unknown> = {};
  for (const m of ["from", "select", "eq", "update"]) q[m] = () => q;
  q.maybeSingle = async () => ({ data: row, error: null });
  q.then = (res: (v: unknown) => void) => res(undefined);
  return q;
};
const ctxFor = (d: Destination): PublishContext => ({
  supabase: supa({ ig_user_id: "ig1", access_token: "tok", scopes: ["instagram_business_content_publish"], token_expires_at: null }) as never,
  userId: "u1", item: item(d), destination: d, budgetMs: 40_000, now, interactive: true,
});
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("what Instagram receives for a Trial Reel", () => {
  it("maps SOCIA's choices to Instagram's two graduation values", () => {
    expect(TRIAL_GRADUATION).toEqual({ manual: "MANUAL", if_performing: "SS_PERFORMANCE" });
  });

  it("builds Meta's documented body: the Reel fields plus a nested trial_params, no share_to_feed, no collaborators", () => {
    const body = buildTrialReelBody({
      mediaType: "REELS", mediaUrl: "https://cdn/a.mp4", caption: "hi", shareToFeed: true, thumbOffsetMs: 1500.4, isAiGenerated: true,
      collaborators: ["someone"], trialGraduation: "SS_PERFORMANCE",
    });
    expect(body).toEqual({
      media_type: "REELS", video_url: "https://cdn/a.mp4", caption: "hi", thumb_offset: 1500, is_ai_generated: true,
      trial_params: { graduation_strategy: "SS_PERFORMANCE" },
    });
  });

  it("leaves a normal Reel's parameters exactly as before", () => {
    expect(buildContainerParams({ mediaType: "REELS", mediaUrl: "u", caption: "c", shareToFeed: true })).toEqual({ media_type: "REELS", video_url: "u", share_to_feed: "true", caption: "c" });
  });

  describe("the request", () => {
    const fetchMock = vi.fn<typeof fetch>();
    beforeEach(() => { vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); });
    afterEach(() => vi.unstubAllGlobals());

    it("posts a JSON body to /media with the token in the query, never in the body", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { id: "c1" }));
      const r = await createContainer("ig1", "tok", { mediaType: "REELS", mediaUrl: "https://cdn/a.mp4", caption: "hi", trialGraduation: "MANUAL" });
      expect(r).toEqual({ ok: true, value: { id: "c1" } });
      const [url, init] = fetchMock.mock.calls[0];
      const u = new URL(String(url));
      expect(u.pathname).toMatch(/\/ig1\/media$/);
      expect(u.searchParams.get("access_token")).toBe("tok");
      expect([...u.searchParams.keys()]).toEqual(["access_token"]);
      expect(init?.method).toBe("POST");
      expect((init?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
      const body = JSON.parse(String(init?.body));
      expect(body.trial_params).toEqual({ graduation_strategy: "MANUAL" });
      expect(body.access_token).toBeUndefined();
    });

    it("sends a normal Reel as query parameters with no body, as before", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { id: "c2" }));
      await createContainer("ig1", "tok", { mediaType: "REELS", mediaUrl: "https://cdn/a.mp4", caption: "hi" });
      const [url, init] = fetchMock.mock.calls[0];
      expect(new URL(String(url)).searchParams.get("video_url")).toBe("https://cdn/a.mp4");
      expect(init?.body).toBeUndefined();
    });
  });
});

describe("the publisher", () => {
  it("plans a trial Reel with Instagram's value and without collaborators", () => {
    const plan = containerPlan(trial("if_performing"), [video], "cap");
    expect(plan.parent).toMatchObject({ mediaType: "REELS", trialGraduation: "SS_PERFORMANCE", collaborators: null });
    expect(containerPlan(reel(), [video], "cap").parent.trialGraduation).toBeNull();
  });

  it("refuses a trial with collaborators before calling Instagram", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const out = await instagramAdapter.publish(ctxFor(dest(trial("manual", { collaborators: ["friend"] }))));
    vi.unstubAllGlobals();
    expect(out).toMatchObject({ status: "failed", errorCode: "trial_collaborators_unverified" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe("when Instagram refuses", () => {
    const fetchMock = vi.fn<typeof fetch>();
    beforeEach(() => { vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); });
    afterEach(() => vi.unstubAllGlobals());

    it("fails with Instagram's own words and the person's options, and never tries a normal Reel", async () => {
      fetchMock
        .mockResolvedValueOnce(json(200, { data: [{ quota_usage: 1, config: { quota_total: 100 } }] }))
        .mockResolvedValueOnce(json(400, { error: { message: "Invalid parameter", error_user_msg: "This account can't use trial reels.", code: 100 } }));
      const out = await instagramAdapter.publish(ctxFor(dest(trial())));
      expect(out.status).toBe("failed");
      expect(out.errorCode).toBe("100");
      expect(out.errorMessage).toBe(`Instagram didn't accept this as a Trial Reel: This account can't use trial reels. Nothing was posted. Retry, or turn off "Publish as Trial Reel" to post it as a normal Reel.`);
      expect(fetchMock).toHaveBeenCalledTimes(2); // quota read, then the one trial container; no second, normal container
      expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).trial_params).toEqual({ graduation_strategy: "MANUAL" });
    });

    it("words a failure that isn't about the trial plainly", () => {
      const quota = { status: "failed" as const, errorCode: "quota_exhausted", errorMessage: "Limit used up.", retryable: true };
      expect(trialFailure(quota)).toEqual(quota);
      const processing = { status: "processing" as const, externalContainerId: "c1", errorCode: null, errorMessage: null };
      expect(trialFailure(processing)).toEqual(processing);
      expect(trialFailure({ status: "failed", errorCode: "container_error", errorMessage: "" }).errorMessage).toContain("Instagram did not say why.");
    });
  });
});

describe("validation and the capability model", () => {
  it("documents Trial Reels on Instagram only and holds the collaborator pair as unverified", () => {
    expect(CAPABILITIES.instagram.features.trialReel).toBe("supported");
    expect(CAPABILITIES.youtube.features.trialReel).toBe("unsupported");
    expect(pairState("instagram", "collaborators", "trialReel")?.state).toBe("unverified");
    expect(pairState("instagram", "trialReel", "altText")).toBeNull();
  });

  it("blocks a trial that isn't a Reel, has no sharing choice, or has collaborators", () => {
    expect(trialIssues(reel())).toEqual([]);
    expect(trialIssues(trial())).toEqual([]);
    expect(trialIssues({ ...trial(), format: "image" }).map((i) => i.code)).toEqual(["trial_not_reel"]);
    expect(trialIssues(reel({ trial: { share: "sometimes" as never } })).map((i) => i.code)).toEqual(["trial_share_missing"]);
    const both = trialIssues(trial("manual", { collaborators: ["friend"] }));
    expect(both).toEqual([expect.objectContaining({ code: "trial_collaborators_unverified", severity: "block", field: "trial" })]);
    expect(both[0].message).toContain("haven't been tested through SOCIA yet");
  });

  it("is part of a destination's readiness", () => {
    const r = validateDestination({ platform: "instagram", media: [video], masterCaption: "hi", settings: trial("manual", { collaborators: ["friend"], collaboratorsCheck: { usernames: ["friend"], status: "accepted", message: "ok", at: now.toISOString() } }), scheduledAt: null, requireFutureTime: false, now });
    expect(r.level).toBe("blocked");
    expect(r.issues.some((i) => i.code === "trial_collaborators_unverified")).toBe(true);
  });
});

describe("SOCIA's record and wording", () => {
  it("reads the choice only from an Instagram Reel's settings", () => {
    expect(trialOf("instagram", trial("if_performing"))).toBe("if_performing");
    expect(trialOf("instagram", reel())).toBeNull();
    expect(trialOf("instagram", { ...trial(), format: "image" })).toBeNull();
    expect(trialOf("youtube", trial() as never)).toBeNull();
    expect(trialOf("instagram", null)).toBeNull();
  });

  it("never claims a trial was shared with everyone", () => {
    expect(trialLine("manual", false)).toBe("Trial Reel: shown to non-followers first. You share it with everyone from the Reel in the Instagram app.");
    expect(trialLine("if_performing", true)).toBe("Trial Reel: shown to non-followers first. Instagram shares it with everyone automatically if it performs well. SOCIA can't see whether it has been shared with everyone.");
  });
});
