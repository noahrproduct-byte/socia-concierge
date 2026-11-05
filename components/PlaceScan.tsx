"use client";

// "Your place": the person adds a few photos of their business and SOCIA
// describes the spots worth filming (lib/place.ts), so scripts and ideas say
// "walk in through the front door" instead of "show your store". Photos are
// resized here, read once on the server and not kept.
//   full    Settings: what SOCIA saw, spot by spot, with update and remove
//   inline  under Video ideas and Ask SOCIA scripts: one line and a button
import { useEffect, useRef, useState } from "react";
import { Camera, MapPin } from "lucide-react";
import { Button } from "@/components/system";
import { PLACE_MAX_PHOTOS, type Place } from "@/lib/place";
import "./place.css";

const EDGE = 1280;

/** A photo as a JPEG data URL no larger than EDGE on its long side, or null when the browser can't read it. */
async function shrink(file: File): Promise<string | null> {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, EDGE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * k);
    canvas.height = Math.round(bmp.height * k);
    canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    return null;
  }
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function PlaceScan({ variant = "full", onScanned }: {
  variant?: "full" | "inline";
  /** after a scan saves, with what SOCIA saw */
  onScanned?: (place: Place) => void;
}) {
  const [place, setPlace] = useState<Place | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<"scan" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/brand/place").then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!alive) return;
      setPlace((j?.place as Place | null) ?? null);
      setCanEdit(Boolean(j?.canEdit));
      setLoaded(true);
    }).catch(() => alive && setLoaded(true));
    return () => { alive = false; };
  }, []);

  const scan = async (files: FileList | null) => {
    const list = Array.from(files ?? []).slice(0, PLACE_MAX_PHOTOS);
    if (input.current) input.current.value = "";
    if (!list.length) return;
    setBusy("scan");
    setError(null);
    const photos = (await Promise.all(list.map(shrink))).filter((p): p is string => Boolean(p));
    if (!photos.length) { setBusy(null); setError("SOCIA couldn't open these photos. Try JPEG or PNG photos."); return; }
    const res = await fetch("/api/brand/place", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ photos }) }).catch(() => null);
    const j = res ? await res.json().catch(() => null) : null;
    setBusy(null);
    if (!res?.ok || !j?.place) { setError((j?.error as string) ?? "SOCIA couldn't read the photos. Try again."); return; }
    setPlace(j.place as Place);
    onScanned?.(j.place as Place);
  };

  const remove = async () => {
    setBusy("remove");
    setError(null);
    const res = await fetch("/api/brand/place", { method: "DELETE" }).catch(() => null);
    setBusy(null);
    if (!res?.ok) { setError("Couldn't remove it. Try again."); return; }
    setPlace(null);
  };

  if (!loaded) return null;
  // A Member can't change the brand; inline there's nothing for them to do.
  if (variant === "inline" && !place && !canEdit) return null;

  const picker = (
    <input
      ref={input}
      type="file"
      accept="image/jpeg,image/png,image/webp,image/heic"
      multiple
      hidden
      onChange={(e) => void scan(e.target.files)}
    />
  );
  const pickLabel = busy === "scan" ? "Looking at your photos" : place ? "Scan new photos" : "Add photos of your place";
  const pick = canEdit && (
    <Button size="sm" variant={place ? "ghost" : "secondary"} busy={busy === "scan"} disabled={Boolean(busy)} onClick={() => input.current?.click()}>
      <Camera size={14} aria-hidden /> {pickLabel}
    </Button>
  );

  if (variant === "inline") {
    return (
      <div className="place-inline">
        {picker}
        <MapPin size={14} aria-hidden />
        <p>
          {place
            ? <>Shots use your place: {place.spots.slice(0, 4).map((s) => s.name).join(", ")}{place.spots.length > 4 ? " and more" : ""}.</>
            : <>Add up to {PLACE_MAX_PHOTOS} photos (the door, the counter, the room) and SOCIA tells you exactly where to film each shot.</>}
        </p>
        {!place && pick}
        {error && <span className="place-err" role="alert">{error}</span>}
      </div>
    );
  }

  return (
    <div className="place">
      {picker}
      <p className="place-lead">
        Add up to {PLACE_MAX_PHOTOS} photos of your place: the entrance, the counter or work area, the room, what you sell. SOCIA names the spots worth filming, and every script, idea and plan then tells you where to stand and what to film there. The photos are only read, not kept.
      </p>
      {place && (
        <>
          <p className="place-kind">{place.kind}</p>
          <ul className="place-spots">
            {place.spots.map((s) => (
              <li key={s.name}>
                <b>{s.name}</b>
                <span>{s.looks}</span>
                {s.filmIt && <span className="place-film">{s.filmIt}</span>}
              </li>
            ))}
          </ul>
          <dl className="place-notes">
            {place.light && (<><dt>Light</dt><dd>{place.light}</dd></>)}
            {place.signature && (<><dt>Good in a first shot</dt><dd>{place.signature}</dd></>)}
            {place.unseen && (<><dt>Not in the photos</dt><dd>{place.unseen}</dd></>)}
          </dl>
          <p className="place-meta">From {place.photos} photo{place.photos === 1 ? "" : "s"}, {day(place.scannedAt)}.</p>
        </>
      )}
      {canEdit ? (
        <div className="place-actions">
          {pick}
          {place && <Button size="sm" variant="ghost" busy={busy === "remove"} disabled={Boolean(busy)} onClick={() => void remove()}>Remove</Button>}
        </div>
      ) : (
        !place && <p className="place-meta">The workspace owner or an admin can add photos of the place.</p>
      )}
      {error && <p className="place-err" role="alert">{error}</p>}
    </div>
  );
}
