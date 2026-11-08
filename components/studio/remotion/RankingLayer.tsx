"use client";

// The AI Clipper's ranking above the picture: the title stays up the whole
// clip and the list fills from the bottom as the countdown plays, the current
// row picked out. Number one stays blank until its moment, which is the point.
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { RANKING_LAYOUT, rankingBand, type RankingOverlay } from "@/lib/clipper/ranking";

const ON_NOW = "#ffd400";

export function RankingLayer({ ranking, fontFamily }: { ranking: RankingOverlay; fontFamily: string }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const k = width / 1080;
  const current = [...ranking.items].reverse().find((i) => i.at <= t + 1e-3);
  const rows = [...ranking.items].sort((a, b) => a.rank - b.rank);
  return (
    <AbsoluteFill style={{ pointerEvents: "none", fontFamily, color: "#fff" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: rankingBand(rows.length, height).top, backgroundColor: "#000" }} />
      <div style={{ position: "absolute", top: RANKING_LAYOUT.titleTop * k, left: 56 * k, right: 56 * k, textAlign: "center", fontSize: (ranking.title.length > 56 ? 50 : 60) * k, lineHeight: 1.15, fontWeight: 800 }}>{ranking.title}</div>
      {rows.map((r, i) => {
        const shown = interpolate(t, [r.at, r.at + 0.15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <div key={r.rank} style={{ position: "absolute", top: (RANKING_LAYOUT.listTop + i * RANKING_LAYOUT.row) * k, left: 56 * k, right: 56 * k, height: RANKING_LAYOUT.row * k, display: "flex", alignItems: "center", gap: 18 * k, fontSize: 46 * k, fontWeight: 800, color: current?.rank === r.rank ? ON_NOW : "#fff" }}>
            <span>{r.rank}.</span>
            <span style={{ opacity: shown, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</span>
          </div>
        );
      })}
    </AbsoluteFill>
  );
}
