#!/bin/sh
# Turn the raw ElevenLabs takes in audio/vo/raw/voNN.mp3 into the placed clips
# audio/vo/NN.mp3: trim leading/trailing silence, speed to 1.2x (pitch kept),
# cap the true peak at -1 dBTP, loudness around -16 LUFS.
set -e
cd "$(dirname "$0")/vo"
mkdir -p raw
for f in vo*.mp3; do [ -f "$f" ] && mv "$f" raw/ || true; done
for raw in raw/vo*.mp3; do
  n=$(basename "$raw" .mp3 | sed 's/^vo//')
  ffmpeg -hide_banner -loglevel error -i "$raw" \
    -af "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse,atempo=1.2,loudnorm=I=-16:TP=-1.5:LRA=11" \
    -ar 48000 -b:a 160k "$n.mp3" -y
  d=$(ffmpeg -hide_banner -i "$n.mp3" 2>&1 | grep -oE "Duration: [0-9:.]+" | head -1)
  echo "$n.mp3 $d"
done
