// Vizard (https://docs.vizard.ai): long video in, captioned vertical clips out.
// Create a project, then poll it (every 30 s is what Vizard recommends) until
// `code` is 2000; a workspace-level webhook can also announce it. Server only.
import { ClipperError, type ClipperOptions, type ClipperProvider, type ClipperSource, type ClipperStatus, type ClipLength, type ProviderClip } from "./provider";

const BASE = "https://elb-api.vizard.ai/hvizard-server-front/open-api/v1";

/** Vizard's preferLength codes. */
const LENGTH_CODE: Record<ClipLength, number> = { auto: 0, under30: 1, "30to60": 2, "60to90": 3, "90to180": 4 };
/** Vizard's videoType codes for the sources SOCIA sends. */
const TYPE_CODE = { url: 1, youtube: 2 } as const;

/** Vizard's status and error codes (docs/retrieve-video-clips). */
export const VIZARD_CODES: Record<number, string> = {
  1000: "Still processing.",
  2000: "Done.",
  4001: "The clipping service rejected SOCIA's key.",
  4002: "Clipping failed on the provider's side.",
  4003: "The clipping service is busy. Try again in a few minutes.",
  4004: "That video format is not supported.",
  4005: "That video link could not be used.",
  4006: "The clipping request was not accepted.",
  4007: "The clipping service has run out of minutes.",
  4008: "The video could not be downloaded from that link.",
};
const RETRYABLE = new Set([4003]);

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** The body SOCIA sends Vizard for a source and options. Pure. */
export function vizardCreateBody(source: ClipperSource, o: ClipperOptions): Record<string, unknown> {
  const lengths = Array.from(new Set(o.lengths.map((l) => LENGTH_CODE[l])));
  const body: Record<string, unknown> = {
    videoUrl: source.url,
    videoType: source.kind === "youtube" ? TYPE_CODE.youtube : TYPE_CODE.url,
    lang: o.lang || "en",
    preferLength: lengths.length ? lengths : [0],
    maxClipNumber: Math.min(100, Math.max(1, Math.round(o.maxClips))),
    subtitleSwitch: o.captions ? 1 : 0,
    headlineSwitch: o.headline ? 1 : 0,
    ratioOfClip: 1,
    clipModel: o.clipModel,
    projectName: "SOCIA clipper",
  };
  if (source.kind !== "youtube") body.ext = source.ext;
  return body;
}

/** What a project/query answer means. Pure, tolerant of missing fields. */
export function parseVizardQuery(json: unknown): ClipperStatus {
  const j = (json ?? {}) as Record<string, unknown>;
  const code = num(j.code);
  if (code === 1000) return { status: "processing" };
  if (code === 2000) {
    const videos = Array.isArray(j.videos) ? j.videos : [];
    const clips: ProviderClip[] = [];
    for (const raw of videos) {
      const v = (raw ?? {}) as Record<string, unknown>;
      const id = str(v.videoId) ?? (num(v.videoId) != null ? String(num(v.videoId)) : null);
      const url = str(v.videoUrl);
      if (!id || !url) continue;
      let topics: string[] = [];
      try {
        const t = typeof v.relatedTopic === "string" ? JSON.parse(v.relatedTopic) : v.relatedTopic;
        if (Array.isArray(t)) topics = t.filter((x): x is string => typeof x === "string");
      } catch { topics = []; }
      clips.push({
        id, videoUrl: url,
        durationMs: num(v.videoMsDuration),
        title: str(v.title),
        score: num(v.viralScore),
        scoreReason: str(v.viralReason),
        transcript: str(v.transcript),
        relatedTopics: topics,
      });
    }
    return { status: "done", clips };
  }
  if (code != null && code >= 4000) return { status: "failed", error: VIZARD_CODES[code] ?? "The clipping service refused the request.", code: String(code) };
  return { status: "processing" };
}

export class VizardClipper implements ClipperProvider {
  readonly name = "vizard";
  constructor(private key = process.env.VIZARD_API_KEY?.trim() ?? "", private fetchImpl: typeof fetch = fetch) {}

  static configured(): boolean {
    return Boolean(process.env.VIZARD_API_KEY?.trim());
  }

  private async call(path: string, init: RequestInit = {}): Promise<unknown> {
    if (!this.key) throw new ClipperError("The clipping service is not configured.", "not_configured");
    const res = await this.fetchImpl(`${BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", VIZARDAI_API_KEY: this.key, ...(init.headers ?? {}) },
    });
    const text = await res.text();
    let json: unknown = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    if (!res.ok) {
      const retry = res.status === 429 || res.status >= 500;
      throw new ClipperError(retry ? "The clipping service is busy. Try again in a few minutes." : "The clipping service refused the request.", `http_${res.status}`, retry);
    }
    return json;
  }

  async submitJob(source: ClipperSource, options: ClipperOptions): Promise<{ providerJobId: string }> {
    const json = (await this.call("/project/create", { method: "POST", body: JSON.stringify(vizardCreateBody(source, options)) })) as Record<string, unknown> | null;
    const code = num(json?.code);
    if (code != null && code >= 4000) throw new ClipperError(VIZARD_CODES[code] ?? "The clipping service refused the request.", String(code), RETRYABLE.has(code));
    const id = str(json?.projectId) ?? (num(json?.projectId) != null ? String(num(json?.projectId)) : null);
    if (!id) throw new ClipperError("The clipping service did not return a project id.", "no_project_id");
    return { providerJobId: id };
  }

  async getJobStatus(providerJobId: string): Promise<ClipperStatus> {
    return parseVizardQuery(await this.call(`/project/query/${encodeURIComponent(providerJobId)}`));
  }

  async getClips(providerJobId: string): Promise<ProviderClip[]> {
    const s = await this.getJobStatus(providerJobId);
    return s.status === "done" ? s.clips : [];
  }
}

/** The configured provider, or null when no key is set. One place to swap providers. */
export function clipperProvider(): ClipperProvider | null {
  return VizardClipper.configured() ? new VizardClipper() : null;
}
