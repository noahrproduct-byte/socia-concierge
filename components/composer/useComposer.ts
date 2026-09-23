"use client";

// The composer's one state owner. Holds the draft (pure reducer from
// contracts.ts), the submission lifecycle, autosave (local and server), the
// in-memory File map for browser-side uploads, and field focus requests.
//
// Nothing here decides what a platform allows; that is the capability model.
// Server answers always win over what the browser believed.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { reduce, idleSubmission, type ComposerAction, type ClientUpload, type ComposerPageProps, type SubmissionState } from "./contracts";
import { fromItem, newDraft, seedDestinations, toPayload, type ComposerDraft, type PickerAccount } from "@/lib/publishing/composer";
import { PLATFORM_LABEL, type ContentItem } from "@/lib/publishing/types";
import { isPlanError } from "@/lib/planErrors";
import { uploadToYouTube, fetchMediaBlob } from "@/lib/publishing/youtubeUpload";
import type { MediaItemWithPreview } from "@/lib/publishing/mediaInfo";

export const MIGRATION_SENTENCE = "SOCIA's database needs the publishing migration (supabase/post-destinations.sql) before posts can be created.";
export const ACCOUNTS_UNKNOWN_SENTENCE = "SOCIA could not read your connected accounts just now. Reload to try again.";

const LOCAL_DEBOUNCE_MS = 500;
const SERVER_DEBOUNCE_MS = 2000;
const POLL_MS = 3000;
const POLL_LIMIT_MS = 10 * 60 * 1000;
const COMPLETE_ATTEMPTS = 3;
const COMPLETE_BACKOFF_MS = [800, 2000];
const IN_FLIGHT = new Set(["uploading", "processing"]);

export type SaveState = { status: "idle" | "saving" | "saved" | "error"; at: string | null; message: string | null };
export type FocusRequest = { key: string | null; field: string; n: number } | null;
export type RestorePrompt = { savedAt: string; accept: () => void; dismiss: () => void } | null;

type LocalCopy = { draft: ComposerDraft; savedAt: string };

class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(j.error ?? `Request failed (${res.status})`, res.status, j);
  return j;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Flatten whatever shape the server used for validation issues into one calm sentence list. */
function issuesText(body: unknown): string | null {
  const out: string[] = [];
  const walk = (v: unknown, depth: number) => {
    if (!v || depth > 4) return;
    if (Array.isArray(v)) { v.forEach((x) => walk(x, depth + 1)); return; }
    if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.message === "string" && typeof o.code === "string") { out.push(o.message); return; }
      // { issues: { "instagram:123": Issue[] } } and friends: walk every value.
      for (const val of Object.values(o)) if (val && typeof val === "object") walk(val, depth + 1);
    }
  };
  walk(body, 0);
  return out.length ? Array.from(new Set(out)).join(" ") : null;
}

function describeError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    if (e.status === 409 && /migration|post_destinations/i.test(e.message)) return MIGRATION_SENTENCE;
    return e.message || fallback;
  }
  return e instanceof Error && e.message ? e.message : fallback;
}

/** A prefilled time is only used when it parses and is still ahead of now. */
function futureIso(at: string | null): string | null {
  if (!at) return null;
  const t = new Date(at).getTime();
  if (!Number.isFinite(t) || t <= Date.now()) return null;
  return new Date(t).toISOString();
}

function seedFrom(props: ComposerPageProps["initial"], accounts: PickerAccount[]): ComposerDraft {
  if (props.item) return fromItem(props.item, accounts);
  const d = newDraft(props.mode);
  d.destinations = seedDestinations(accounts);
  d.masterCaption = props.caption ?? "";
  d.planId = props.planId;
  d.planDay = props.planDay;
  if (props.source) d.source = props.source;
  const at = futureIso(props.at);
  if (at) d.schedule = { mode: "later", at, sameForAll: true };
  return d;
}

const hasContent = (d: ComposerDraft) => d.masterCaption.trim().length > 0 || d.media.length > 0;

const storageKey = (userId: string, postId: string | null) => `socia:composer:${userId}:${postId ?? "new"}`;

function readLocal(key: string): LocalCopy | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const j = JSON.parse(raw) as LocalCopy;
    return j && j.draft && typeof j.savedAt === "string" ? j : null;
  } catch {
    return null;
  }
}

function writeLocal(key: string, draft: ComposerDraft) {
  try {
    // Object URLs and posters are per-browser-session and can be large; keep the wire fields only.
    const slim = { ...draft, media: draft.media.map(({ id, kind, name, mime, size, width, height, duration, path, url }) => ({ id, kind, name, mime, size, width, height, duration, path, url })) };
    localStorage.setItem(key, JSON.stringify({ draft: slim, savedAt: new Date().toISOString() }));
  } catch {
    // storage full or blocked: autosave is a convenience, never a requirement
  }
}

function removeLocal(key: string) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

const revokeUrl = (url: string | null | undefined) => {
  if (!url || !url.startsWith("blob:")) return;
  try { URL.revokeObjectURL(url); } catch { /* ignore */ }
};

export type Composer = {
  draft: ComposerDraft;
  dispatch: (a: ComposerAction) => void;
  submission: SubmissionState;
  submit: (action: "draft" | "schedule" | "publish") => Promise<void>;
  retry: (destinationId: string) => Promise<void>;
  focusField: (destinationKey: string | null, field: string) => void;
  focusRequest: FocusRequest;
  registerFile: (mediaId: string, file: File) => void;
  fileFor: (mediaId: string) => File | null;
  /** Save now and resolve the post id (creating the row when needed). Null when the server refused. */
  ensurePostId: () => Promise<string | null>;
  saveState: SaveState;
  restore: RestorePrompt;
  loading: boolean;
  backToEditing: () => void;
  /** Forget this post and start an empty one (the URL loses ?post=). */
  startNew: () => void;
};

export function useComposer(props: ComposerPageProps & { postId?: string | null }): Composer {
  const { userId, accounts, initial, ready, accountsComplete } = props;
  const requestedPostId = props.postId ?? initial.item?.id ?? null;
  const router = useRouter();

  const [draft, rawDispatch] = useReducer(reduce, undefined, () => seedFrom(initial, accounts));
  const [submission, setSubmission] = useState<SubmissionState>(idleSubmission);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle", at: null, message: null });
  const [focusRequest, setFocusRequest] = useState<FocusRequest>(null);
  const [restore, setRestore] = useState<RestorePrompt>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(requestedPostId && !initial.item));

  const draftRef = useRef(draft);
  draftRef.current = draft;
  const files = useRef(new Map<string, File>());
  const dirty = useRef(false);
  const restorePending = useRef(false);
  const saveChain = useRef<Promise<string | null>>(Promise.resolve(null));
  const submissionRef = useRef(submission);
  submissionRef.current = submission;
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Bumped on every stop; a tick from an older generation may neither poll again nor set state. */
  const pollGen = useRef(0);
  const mounted = useRef(true);
  const serverItemUpdated = useRef<string | null>(initial.item?.updatedAt ?? null);
  /**
   * YouTube video ids the browser uploaded but could not confirm to SOCIA
   * (the complete call kept failing). Retry re-sends the confirmation; the
   * bytes are never uploaded twice.
   */
  const pendingConfirm = useRef(new Map<string, string>());

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const dispatch = useCallback((a: ComposerAction) => {
    if (a.type !== "load" && a.type !== "set_post_id") dirty.current = true;
    rawDispatch(a);
  }, []);

  // ---- object URLs: revoke whatever left the draft (replace, remove, restore, load), and everything on unmount
  const previews = useRef(new Set<string>());
  useEffect(() => {
    const live = new Set<string>();
    for (const m of draft.media as MediaItemWithPreview[]) if (m.previewUrl) live.add(m.previewUrl);
    for (const url of previews.current) if (!live.has(url)) revokeUrl(url);
    previews.current = live;
  }, [draft.media]);
  useEffect(() => () => { for (const url of previews.current) revokeUrl(url); previews.current.clear(); }, []);

  // ---- load an existing item -------------------------------------------------
  useEffect(() => {
    if (!requestedPostId || initial.item) return;
    let cancelled = false;
    (async () => {
      try {
        const { item } = await api<{ item: ContentItem }>(`/api/posts/${encodeURIComponent(requestedPostId)}`);
        if (cancelled) return;
        serverItemUpdated.current = item.updatedAt ?? null;
        rawDispatch({ type: "load", draft: fromItem(item, accounts) });
        if (item.destinations.some((d) => IN_FLIGHT.has(d.status))) {
          setSubmission({ ...idleSubmission(), phase: "tracking", item });
        }
      } catch (e) {
        if (!cancelled) setSaveState({ status: "error", at: null, message: describeError(e, "This post could not be loaded.") });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedPostId]);

  // ---- local autosave + one-time restore prompt --------------------------------
  const localKey = storageKey(userId, draft.postId ?? requestedPostId);
  const restoreChecked = useRef(false);

  useEffect(() => {
    // Once, and only after an edited item has arrived so "newer" compares against the real server copy.
    if (loading || restoreChecked.current) return;
    restoreChecked.current = true;
    const copy = readLocal(localKey);
    if (!copy || !hasContent(copy.draft)) return;
    const newer = !serverItemUpdated.current || new Date(copy.savedAt).getTime() > new Date(serverItemUpdated.current).getTime();
    if (!newer) return;
    restorePending.current = true;
    setRestore({
      savedAt: copy.savedAt,
      accept: () => {
        rawDispatch({ type: "load", draft: { ...copy.draft, destinations: mergeDestinations(copy.draft, accounts) } });
        dirty.current = true;
        restorePending.current = false;
        setRestore(null);
      },
      dismiss: () => {
        removeLocal(localKey);
        restorePending.current = false;
        setRestore(null);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  useEffect(() => {
    if (!dirty.current || restorePending.current) return;
    const t = setTimeout(() => writeLocal(localKey, draftRef.current), LOCAL_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [draft, localKey]);

  // When the row gets its id the "new" copy is stale.
  useEffect(() => {
    if (draft.postId) removeLocal(storageKey(userId, null));
  }, [draft.postId, userId]);

  // ---- server autosave -----------------------------------------------------------
  const saveNow = useCallback((): Promise<string | null> => {
    const run = async (): Promise<string | null> => {
      const d = draftRef.current;
      if (!ready) return d.postId;
      setSaveState((s) => ({ ...s, status: "saving", message: null }));
      try {
        const { item } = await api<{ item: ContentItem }>("/api/posts", { method: "POST", body: JSON.stringify(toPayload(d, "draft")) });
        if (item?.id && !draftRef.current.postId) rawDispatch({ type: "set_post_id", id: item.id });
        serverItemUpdated.current = item?.updatedAt ?? serverItemUpdated.current;
        setSaveState({ status: "saved", at: new Date().toISOString(), message: null });
        return item?.id ?? draftRef.current.postId;
      } catch (e) {
        setSaveState({ status: "error", at: null, message: describeError(e, "The draft could not be saved.") });
        return draftRef.current.postId;
      }
    };
    const next = saveChain.current.then(run, run);
    saveChain.current = next;
    return next;
  }, [ready]);

  useEffect(() => {
    if (!ready || !dirty.current || restorePending.current) return;
    if (!hasContent(draft)) return;
    const phase = submissionRef.current.phase;
    if (phase !== "idle" && phase !== "error") return;
    const t = setTimeout(() => { void saveNow(); }, SERVER_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [draft, ready, saveNow]);

  const ensurePostId = useCallback(async (): Promise<string | null> => {
    if (draftRef.current.postId) return draftRef.current.postId;
    return saveNow();
  }, [saveNow]);

  // ---- files kept in memory for browser-side uploads --------------------------------
  const registerFile = useCallback((mediaId: string, file: File) => { files.current.set(mediaId, file); }, []);
  const fileFor = useCallback((mediaId: string) => files.current.get(mediaId) ?? null, []);

  // ---- tracking ------------------------------------------------------------------
  const stopPolling = useCallback(() => {
    pollGen.current += 1;
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = null;
  }, []);

  const track = useCallback((postId: string, startedAt = Date.now()) => {
    stopPolling();
    const gen = pollGen.current;
    const alive = () => mounted.current && gen === pollGen.current;
    const tick = async () => {
      pollTimer.current = null;
      if (!alive()) return;
      try {
        const { item } = await api<{ item: ContentItem }>(`/api/posts/${encodeURIComponent(postId)}`);
        if (!alive()) return;
        const inFlight = item.destinations.some((d) => IN_FLIGHT.has(d.status));
        if (!inFlight) {
          setSubmission((s) => ({ ...s, phase: "done", item }));
          return;
        }
        if (Date.now() - startedAt > POLL_LIMIT_MS) {
          setSubmission((s) => ({ ...s, phase: "done", item, error: "Still processing after 10 minutes. SOCIA keeps checking in the background; the calendar shows the result when the platform answers." }));
          return;
        }
        setSubmission((s) => ({ ...s, phase: "tracking", item }));
      } catch (e) {
        if (!alive()) return;
        setSubmission((s) => ({ ...s, error: describeError(e, "SOCIA could not read the post's status.") }));
      }
      if (!alive()) return;
      pollTimer.current = setTimeout(tick, POLL_MS);
    };
    pollTimer.current = setTimeout(tick, POLL_MS);
  }, [stopPolling]);

  useEffect(() => stopPolling, [stopPolling]);

  // Resume tracking when an edited item was already in flight.
  useEffect(() => {
    if (submission.phase === "tracking" && submission.item && !pollTimer.current) track(submission.item.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submission.phase]);

  // ---- browser-side uploads the server asked for ----------------------------------------
  const completeUrl = (postId: string, destinationId: string) =>
    `/api/posts/${encodeURIComponent(postId)}/destinations/${encodeURIComponent(destinationId)}/complete`;

  /** Tell SOCIA the video id YouTube returned; a few short retries before giving up. Throws the last error. */
  const confirmUpload = useCallback(async (postId: string, destinationId: string, videoId: string): Promise<ContentItem | null> => {
    let last: unknown = null;
    for (let attempt = 0; attempt < COMPLETE_ATTEMPTS; attempt++) {
      if (attempt > 0) await sleep(COMPLETE_BACKOFF_MS[Math.min(attempt - 1, COMPLETE_BACKOFF_MS.length - 1)]);
      try {
        const done = await api<{ item?: ContentItem }>(completeUrl(postId, destinationId), { method: "POST", body: JSON.stringify({ externalPostId: videoId }) });
        return done.item ?? null;
      } catch (e) {
        last = e;
        // A refusal the server will repeat (bad id, not our row) is not worth two more tries.
        if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429) break;
      }
    }
    throw last instanceof Error ? last : new Error("SOCIA could not record the upload.");
  }, []);

  /** Best effort: mark the destination failed on the server so the row is not left "uploading" forever. */
  const reportUploadFailure = useCallback(async (postId: string, destinationId: string, message: string): Promise<ContentItem | null> => {
    try {
      const res = await api<{ item?: ContentItem }>(completeUrl(postId, destinationId), { method: "POST", body: JSON.stringify({ error: message }) });
      return res.item ?? null;
    } catch {
      return null;
    }
  }, []);

  const runUploads = useCallback(async (item: ContentItem, uploads: ClientUpload[]): Promise<string | null> => {
    let firstError: string | null = null;
    for (const u of uploads) {
      const media = item.media.find((m) => m.id === u.mediaId) ?? draftRef.current.media.find((m) => m.id === u.mediaId) ?? null;
      const dest = item.destinations.find((d) => d.id === u.destinationId) ?? null;
      const label = dest ? PLATFORM_LABEL[dest.platform] : "The platform";
      let videoId: string | null = null;
      try {
        if (!media) throw new Error("The media file for this upload is missing.");
        const blob: Blob = files.current.get(media.id) ?? (media.url ? await fetchMediaBlob(media.url) : (() => { throw new Error("The media file is not uploaded yet."); })());
        // No progress figure exists yet, so no entry: the bar stays indeterminate until YouTube reports bytes.
        setSubmission((s) => ({ ...s, phase: "uploading" }));
        const result = await uploadToYouTube({
          sessionUri: u.sessionUri, accessToken: u.accessToken, blob, mime: media.mime,
          onProgress: (f) => setSubmission((s) => ({ ...s, progress: { ...s.progress, [u.destinationId]: Math.max(0, Math.min(1, f)) } })),
        });
        videoId = result.videoId;
        setSubmission((s) => ({ ...s, progress: { ...s.progress, [u.destinationId]: 1 } }));
      } catch (e) {
        const msg = `${label}: ${describeError(e, "the upload did not complete.")}`;
        firstError = firstError ?? msg;
        const updated = await reportUploadFailure(item.id, u.destinationId, describeError(e, "The upload did not complete."));
        setSubmission((s) => {
          const progress = { ...s.progress };
          delete progress[u.destinationId];
          return { ...s, error: msg, progress, item: updated ?? s.item };
        });
        continue;
      }
      try {
        const updated = await confirmUpload(item.id, u.destinationId, videoId);
        pendingConfirm.current.delete(u.destinationId);
        if (updated) setSubmission((s) => ({ ...s, item: updated }));
      } catch (e) {
        // YouTube has the video. Keep its id so Retry re-sends the confirmation instead of uploading again.
        pendingConfirm.current.set(u.destinationId, videoId);
        const msg = `${label} received the video, but SOCIA could not record it (${describeError(e, "no answer from the server")}). Choose Upload again to send the confirmation once more; nothing is uploaded twice.`;
        firstError = firstError ?? msg;
        setSubmission((s) => {
          const progress = { ...s.progress };
          delete progress[u.destinationId];
          return { ...s, error: msg, progress };
        });
      }
    }
    return firstError;
  }, [confirmUpload, reportUploadFailure]);

  const handleServerAnswer = useCallback(async (res: { item: ContentItem; uploads?: ClientUpload[] }, action: "draft" | "schedule" | "publish" | "retry") => {
    const item = res.item;
    serverItemUpdated.current = item?.updatedAt ?? serverItemUpdated.current;
    if (item?.id && !draftRef.current.postId) rawDispatch({ type: "set_post_id", id: item.id });
    if (action === "draft") {
      setSubmission((s) => ({ ...s, phase: "idle", item, uploads: [], error: null }));
      setSaveState({ status: "saved", at: new Date().toISOString(), message: null });
      return;
    }
    // The upload sessions carry an access token: they go straight to the uploader and never into state.
    const uploads = res.uploads ?? [];
    setSubmission((s) => ({ ...s, item, uploads: [] }));
    if (uploads.length) await runUploads(item, uploads);
    if (!mounted.current) return;
    // Whatever happened in the browser, the server's view of each destination is the truth now.
    let latest = item;
    try {
      latest = (await api<{ item: ContentItem }>(`/api/posts/${encodeURIComponent(item.id)}`)).item ?? item;
    } catch { /* keep what we have */ }
    if (!mounted.current) return;
    const inFlight = latest.destinations.some((d) => IN_FLIGHT.has(d.status));
    setSubmission((s) => ({ ...s, phase: inFlight ? "tracking" : "done", item: latest }));
    if (inFlight) track(latest.id);
  }, [runUploads, track]);

  const failSubmission = useCallback((e: unknown) => {
    if (!mounted.current) return;
    if (e instanceof ApiError && e.status === 403 && isPlanError(e.body)) {
      setSubmission((s) => ({ ...s, phase: "error", planError: e.body as SubmissionState["planError"], error: null }));
      return;
    }
    if (e instanceof ApiError && e.status === 400) {
      const text = issuesText(e.body);
      setSubmission((s) => ({ ...s, phase: "error", error: text ?? e.message }));
      return;
    }
    setSubmission((s) => ({ ...s, phase: "error", error: describeError(e, "Something went wrong.") }));
  }, []);

  const submit = useCallback(async (action: "draft" | "schedule" | "publish") => {
    stopPolling();
    if (action !== "draft" && !accountsComplete) {
      // The account list is a lower bound right now; scheduling against it could pick the wrong account. Drafts are fine.
      setSubmission((s) => ({ ...s, phase: "error", error: ACCOUNTS_UNKNOWN_SENTENCE, planError: null }));
      return;
    }
    // Let a pending autosave finish so the two never race for the same row.
    await saveChain.current.catch(() => null);
    setSubmission((s) => ({ ...idleSubmission(), item: s.item, phase: action === "draft" ? "saving" : "submitting" }));
    try {
      const res = await api<{ item: ContentItem; uploads?: ClientUpload[] }>("/api/posts", { method: "POST", body: JSON.stringify(toPayload(draftRef.current, action)) });
      dirty.current = false;
      removeLocal(storageKey(userId, null));
      if (res.item?.id) removeLocal(storageKey(userId, res.item.id));
      await handleServerAnswer(res, action);
    } catch (e) {
      failSubmission(e);
    }
  }, [accountsComplete, failSubmission, handleServerAnswer, stopPolling, userId]);

  const retry = useCallback(async (destinationId: string) => {
    const postId = submissionRef.current.item?.id ?? draftRef.current.postId;
    if (!postId) return;
    stopPolling();
    setSubmission((s) => ({ ...s, phase: "submitting", error: null, planError: null }));
    try {
      // A video YouTube already holds is confirmed again, never uploaded again.
      const held = pendingConfirm.current.get(destinationId);
      if (held) {
        const updated = await confirmUpload(postId, destinationId, held);
        pendingConfirm.current.delete(destinationId);
        const item = updated ?? submissionRef.current.item;
        if (!item) return;
        await handleServerAnswer({ item }, "retry");
        return;
      }
      const res = await api<{ item: ContentItem; uploads?: ClientUpload[] }>(`/api/posts/${encodeURIComponent(postId)}/destinations/${encodeURIComponent(destinationId)}/retry`, { method: "POST", body: "{}" });
      await handleServerAnswer(res, "retry");
    } catch (e) {
      failSubmission(e);
    }
  }, [confirmUpload, failSubmission, handleServerAnswer, stopPolling]);

  const backToEditing = useCallback(() => {
    stopPolling();
    setSubmission((s) => ({ ...idleSubmission(), item: s.item }));
  }, [stopPolling]);

  const startNew = useCallback(() => {
    stopPolling();
    pendingConfirm.current.clear();
    files.current.clear();
    dirty.current = false;
    serverItemUpdated.current = null;
    rawDispatch({ type: "load", draft: seedFrom({ ...initial, item: null, caption: null, planId: null, planDay: null, source: null, at: null }, accounts) });
    setSubmission(idleSubmission());
    setSaveState({ status: "idle", at: null, message: null });
    setFocusRequest(null);
    if (props.postId) router.replace("/create");
  }, [accounts, initial, props.postId, router, stopPolling]);

  const focusField = useCallback((destinationKey: string | null, field: string) => {
    setFocusRequest((f) => ({ key: destinationKey, field, n: (f?.n ?? 0) + 1 }));
  }, []);

  return useMemo<Composer>(() => ({
    draft, dispatch, submission, submit, retry, focusField, focusRequest, registerFile, fileFor, ensurePostId, saveState, restore, loading, backToEditing, startNew,
  }), [draft, dispatch, submission, submit, retry, focusField, focusRequest, registerFile, fileFor, ensurePostId, saveState, restore, loading, backToEditing, startNew]);
}

/** A restored copy keeps its choices but the account list is whatever is connected now. */
function mergeDestinations(saved: ComposerDraft, accounts: PickerAccount[]) {
  const seeded = seedDestinations(accounts);
  return seeded.map((s) => {
    const prev = saved.destinations.find((d) => d.key === s.key);
    return prev ? { ...s, enabled: prev.enabled, settings: prev.settings, scheduledAt: prev.scheduledAt } : s;
  });
}
