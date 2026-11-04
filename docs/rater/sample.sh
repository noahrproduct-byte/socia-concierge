#!/bin/zsh
# Usage: sample.sh <sample-dir> — expects <dir>/reel.mp4; writes frames at the
# app's ten sample times (lib/studio.ts extractFrames), loudness, silences and a
# contact sheet. Local tooling for rater training only.
set -e; setopt null_glob
d="$1"; cd "$d"
dur=$(ffmpeg -hide_banner -i reel.mp4 2>&1 | sed -n 's/.*Duration: \([0-9:.]*\),.*/\1/p' | awk -F: '{print $1*3600+$2*60+$3}')
echo "duration=$dur"
ffmpeg -hide_banner -i reel.mp4 2>&1 | grep -E 'Stream' | sed 's/^ *//'
echo "== loudness =="; ffmpeg -hide_banner -i reel.mp4 -af volumedetect -vn -f null - 2>&1 | grep -E 'mean_volume|max_volume' | sed 's/.*\] //'
echo "== silences (<-35dB, >=0.4s) =="; ffmpeg -hide_banner -i reel.mp4 -af silencedetect=noise=-35dB:d=0.4 -vn -f null - 2>&1 | grep -oE 'silence_(start|end): [0-9.]+' | paste -sd' ' - || true
echo "== scene cuts (>0.35) =="; ffmpeg -hide_banner -i reel.mp4 -vf "select='gt(scene,0.35)',showinfo" -an -f null - 2>&1 | grep -oE 'pts_time:[0-9.]+' | cut -d: -f2 | awk '{printf "%.1f ", $1}'; echo
times=$(awk -v d="$dur" 'BEGIN{ n=0; split("0 0.7 1.5 2.5",e," "); for(i=1;i<=4;i++) if(e[i]<d){t[n++]=e[i]} r=10-n; for(i=1;i<=r;i++){x=2.5+(i/(r+1))*(d-2.5); if(x<d) t[n++]=sprintf("%.2f",x)} for(i=0;i<n;i++) printf "%s ", t[i] }')
echo "frames at: $times"
rm -f f_*.jpg; in=""; i=0
for t in ${=times}; do ts=$t; if (( $(awk -v a="$t" -v d="$dur" 'BEGIN{print (a>d-0.1)}') )); then ts=$(awk -v d="$dur" 'BEGIN{printf "%.2f", d-0.1}'); fi; f=$(printf "f_%02d_%s.jpg" $i $t); ffmpeg -hide_banner -loglevel error -ss $ts -i reel.mp4 -frames:v 1 -vf scale=480:-1 -pix_fmt yuvj420p -y "$f"; in="$in -i $f"; i=$((i+1)); done
ffmpeg -hide_banner -loglevel error ${=in} -filter_complex "[0][1][2][3][4][5][6][7][8][9]xstack=inputs=10:layout=0_0|w0_0|w0+w1_0|w0+w1+w2_0|w0+w1+w2+w3_0|0_h0|w0_h0|w0+w1_h0|w0+w1+w2_h0|w0+w1+w2+w3_h0,scale=1800:-1" -pix_fmt yuvj420p -y sheet.jpg
ls f_*.jpg sheet.jpg | paste -sd' ' -
