#!/bin/sh
# Master the rendered reel to the reference's level: -14 LUFS integrated with a
# -1 dBTP ceiling. Pass 1 measures the mix, pass 2 applies a fixed gain and a
# limiter (no dynamic normalisation, so nothing pumps).
# Usage: sh master.sh in.mp4 out.mp4
set -e
in="$1"; out="$2"; target=-14
I=$(ffmpeg -hide_banner -i "$in" -vn -af ebur128 -f null - 2>&1 | grep -E "^\s+I:" | tail -1 | awk '{print $2}')
gain=$(echo "$target - ($I)" | bc -l)
echo "measured $I LUFS, applying ${gain} dB then limiting at -1 dBTP"
ffmpeg -hide_banner -loglevel error -y -i "$in" -c:v copy \
  -af "volume=${gain}dB,alimiter=limit=0.84:attack=4:release=60:level=false" \
  -c:a aac -b:a 256k "$out"
ffmpeg -hide_banner -i "$out" -vn -af "ebur128=peak=true" -f null - 2>&1 | grep -E "^\s+I:|LRA:|Peak:" | tail -3
