"use client";

// "Delete from Instagram" (or YouTube, or Facebook) for one published post.
// Three states, never a dead button:
//   - can delete: a danger button behind a confirm dialog;
//   - cannot: the reason in one plain sentence, a link to the post on the
//     platform, and Settings when a reconnect would fix it;
//   - already deleted: a Deleted pill and the date.
// The answer comes from the server (lib/platformDelete); the platform's own
// words are shown when it refuses. SOCIA keeps the post in its record.

import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button, ConfirmDialog, StatusPill, useToast } from "@/components/system";
import { PLATFORM_LABEL, type Platform } from "@/lib/publishing/types";
import { deletedLine, type DeleteCapability } from "@/lib/platformDelete/types";

export type DeleteInfo = {
  destinationId: string | null;
  platform: Platform;
  permalink: string | null;
  deletedAt: string | null;
  /** "Reel", "post", "video", "carousel". */
  noun: string;
  /** null once deleted. */
  capability: DeleteCapability | null;
};

type Request = { url: string; method: "POST" | "DELETE"; body?: unknown };

/** Read the delete answer for one post. `url` null = do not ask (closed drawer, no permission). */
export function useDeleteInfo<T>(url: string | null, pick: (json: unknown) => T | null): { data: T | null; loading: boolean; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  // A different post: forget the previous answer before asking again.
  const [forUrl, setForUrl] = useState(url);
  if (forUrl !== url) {
    setForUrl(url);
    setData(null);
    setError(null);
  }
  useEffect(() => {
    if (!url) return;
    let live = true;
    setLoading(true);
    setError(null);
    fetch(url, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!live) return;
        if (!r.ok) setError((j as { error?: string } | null)?.error ?? "SOCIA could not check this post.");
        else setData(pick(j));
      })
      .catch(() => live && setError("SOCIA could not check this post."))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
    // pick is a stable selector in every caller
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, tick]);
  return { data, loading, error, reload: useCallback(() => setTick((t) => t + 1), []) };
}

export default function DeleteOnPlatform({
  info,
  canDelete,
  request,
  collabWarning,
  onDeleted,
}: {
  info: DeleteInfo;
  /** The viewer's role allows deleting (owner or admin). */
  canDelete: boolean;
  request: Request;
  /** A collab post SOCIA published: deleting removes it from every collaborator's profile. */
  collabWarning?: boolean;
  onDeleted?: (deletedAt: string) => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deletedAt, setDeletedAt] = useState<string | null>(info.deletedAt);
  const name = PLATFORM_LABEL[info.platform];

  if (deletedAt) {
    return (
      <p className="s-hint">
        <StatusPill tone="outline">Deleted</StatusPill> {deletedLine(info.platform, deletedAt)}. SOCIA kept the record.
      </p>
    );
  }

  const cap = info.capability;
  if (!cap) return null;

  const openLink = info.permalink ? (
    <a className="s-link" href={info.permalink} target="_blank" rel="noreferrer">
      Open on {name}<span className="s-sr"> (opens in a new tab)</span>
    </a>
  ) : null;

  // A reason nobody in the workspace can fix (TikTok, a collab post, another
  // account) is shown to everyone; one an owner or admin can fix (reconnect)
  // is shown with its Settings link only to them.
  if (!cap.canDelete && (canDelete || !cap.action)) {
    return (
      <p className="s-hint">
        {cap.reason}{" "}
        {canDelete && cap.action && <a className="s-link" href="/settings">Open Settings</a>}
        {canDelete && cap.action && openLink ? " · " : null}
        {openLink}
      </p>
    );
  }

  if (!canDelete) {
    return <p className="s-hint">Only the workspace owner or an admin can delete this from {name}.</p>;
  }

  const confirm = async () => {
    setBusy(true);
    try {
      const res = await fetch(request.url, {
        method: request.method,
        headers: request.body !== undefined ? { "Content-Type": "application/json" } : undefined,
        body: request.body !== undefined ? JSON.stringify(request.body) : undefined,
      });
      const j = (await res.json().catch(() => null)) as { deletedAt?: string; gone?: boolean; error?: string } | null;
      if (!res.ok || !j?.deletedAt) {
        toast.add({ title: j?.error ?? `${name} did not confirm the deletion. Nothing was changed.`, type: "error" });
        return;
      }
      setOpen(false);
      setDeletedAt(j.deletedAt);
      toast.add({ title: j.gone ? `${name} says this ${info.noun} was already gone. SOCIA marked it deleted.` : `Deleted from ${name}. SOCIA kept the record.` });
      onDeleted?.(j.deletedAt);
    } catch {
      toast.add({ title: `${name} could not be reached. Nothing was changed.`, type: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        <Trash2 aria-hidden /> Delete from {name}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(o) => !busy && setOpen(o)}
        title={`Delete this ${info.noun} from ${name}?`}
        body={
          <>
            {name} removes it for everyone, and this cannot be undone. SOCIA keeps the post and the last numbers it measured in your record, marked as deleted.
            {collabWarning ? " It is a collab post, so it also disappears from every collaborator's profile." : null}
          </>
        }
        confirmLabel={`Delete from ${name}`}
        onConfirm={confirm}
        danger
        busy={busy}
      />
    </>
  );
}
