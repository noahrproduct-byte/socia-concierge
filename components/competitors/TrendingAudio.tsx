"use client";

// Instagram's trending audio (lib/igAudio.ts): music and original sounds, in
// the order Meta lists them. Meta publishes no play or Reel counts for these,
// so nothing is ranked or numbered; the footnote says what the list is.

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Music2, Pause, Play } from "lucide-react";
import type { TrendingAudio as AudioData, TrendingAudioItem } from "@/lib/igAudio";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function AudioList({ title, items, playing, onPlay }: { title: string; items: TrendingAudioItem[]; playing: string | null; onPlay: (a: TrendingAudioItem) => void }) {
  return (
    <div className="cx3-audio-col">
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="cx3-empty">Instagram didn&apos;t list any right now.</p>
      ) : (
        <ul>
          {items.map((a) => (
            <li key={a.id}>
              {a.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.cover} alt="" loading="lazy" referrerPolicy="no-referrer" />
              ) : (
                <i aria-hidden><Music2 size={15} /></i>
              )}
              <div>
                <b title={a.title}>{a.title}</b>
                <small>{[a.by, a.durationSec ? mmss(a.durationSec) : null].filter(Boolean).join(" | ")}</small>
              </div>
              {a.preview && (
                <button type="button" className="cx3-audio-btn" onClick={() => onPlay(a)} aria-label={playing === a.id ? `Pause ${a.title}` : `Play a preview of ${a.title}`}>
                  {playing === a.id ? <Pause size={14} /> : <Play size={14} />}
                </button>
              )}
              {a.link && (
                <a href={a.link} target="_blank" rel="noopener noreferrer" className="cx3-audio-btn" aria-label={`Open ${a.title} on Instagram`}>
                  <ExternalLink size={14} />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TrendingAudio({ audio }: { audio: AudioData | null }) {
  const player = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  useEffect(() => () => player.current?.pause(), []);
  if (!audio) return null;

  const onPlay = (a: TrendingAudioItem) => {
    if (playing === a.id) { player.current?.pause(); setPlaying(null); return; }
    player.current?.pause();
    const el = new Audio(a.preview!);
    el.onended = () => setPlaying((p) => (p === a.id ? null : p));
    el.onerror = () => setPlaying((p) => (p === a.id ? null : p));
    player.current = el;
    el.play().then(() => setPlaying(a.id)).catch(() => setPlaying(null));
  };

  return (
    <section className="ov-card cx2-card cx3">
      <div className="cx2-card-head">
        <h2>
          <Music2 size={14} /> Trending audio on Instagram
        </h2>
        <span className="cx2-micro">As Instagram lists it</span>
      </div>
      {audio.status === "unavailable" ? (
        <p className="cx3-empty">{audio.reason}</p>
      ) : (
        <div className="cx3-audio">
          <AudioList title="Music" items={audio.music} playing={playing} onPlay={onPlay} />
          <AudioList title="Original sounds" items={audio.sounds} playing={playing} onPlay={onPlay} />
        </div>
      )}
      <small className="cx2-foot">
        The audio Instagram makes available to apps, in Instagram&apos;s order. It can differ from the list in the Instagram app, and Instagram shares no play or Reel counts for it. Open a sound in Instagram to use it in your Reel.
      </small>
    </section>
  );
}
