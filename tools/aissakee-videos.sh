#!/usr/bin/env bash
# Prepares one of Kee's UGC videos for the portfolio (aissakee/video/):
# at most 720 px wide with the original shape (nothing cropped, so no cut hair),
# H.264 + AAC with fast start, every metadata tag removed (phones store the location),
# and a WebP cover frame.
# Usage: tools/aissakee-videos.sh <input video> <name> [cover second, default 1]
set -euo pipefail
in="$1"; name="$2"; at="${3:-1}"
out="$(dirname "$0")/../aissakee/video"
mkdir -p "$out"
ffmpeg -hide_banner -loglevel error -y -i "$in" -map 0:v:0 -map '0:a:0?' -map_metadata -1 -map_chapters -1 \
  -vf "scale='min(720,iw)':-2,fps=30" -c:v libx264 -preset slow -crf 26 -profile:v high -pix_fmt yuv420p \
  -c:a aac -b:a 96k -movflags +faststart "$out/$name-720.mp4"
ffmpeg -hide_banner -loglevel error -y -ss "$at" -i "$out/$name-720.mp4" -frames:v 1 -map_metadata -1 \
  -c:v libwebp -quality 80 "$out/$name-poster.webp"
ls -la "$out/$name-720.mp4" "$out/$name-poster.webp"
