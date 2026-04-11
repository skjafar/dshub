#!/usr/bin/env bash
# =============================================================================
# DSHub GIF Generator
# =============================================================================
# Converts a segment of the showcase video to a high-quality GIF using
# ffmpeg's two-pass palette method (best quality, smallest file size).
#
# Usage:
#   ./scripts/make_gif.sh [input] [start_sec] [duration_sec] [output]
#
# Examples:
#   ./scripts/make_gif.sh                              # defaults (Plot Panel segment)
#   ./scripts/make_gif.sh /tmp/dshub-showcase.mp4 35 12
#   ./scripts/make_gif.sh /tmp/dshub-showcase.mp4 0 60 /tmp/full.gif
#
# Defaults:
#   input    = /tmp/dshub-showcase.mp4
#   start    = 35s  (approx start of Plot Panel scene)
#   duration = 15s
#   output   = /tmp/dshub-showcase.gif
#   width    = 1080px (downscaled from 1440; Reddit optimal)
#   fps      = 15
# =============================================================================

set -e

INPUT="${1:-/tmp/dshub-showcase.mp4}"
START="${2:-35}"
DURATION="${3:-15}"
OUTPUT="${4:-/tmp/dshub-showcase.gif}"
PALETTE="/tmp/dshub-palette.png"
WIDTH=1080     # Reddit recommends ≤1080px wide for preview
FPS=15         # 15fps is the sweet spot: smooth yet small

log()  { echo -e "\033[36m[GIF]\033[0m $*"; }

if [[ ! -f "$INPUT" ]]; then
  echo "ERROR: Input file not found: $INPUT" >&2
  echo "Run ./scripts/record_showcase.sh first." >&2
  exit 1
fi

if ! command -v ffmpeg &>/dev/null; then
  echo "ERROR: ffmpeg not found." >&2
  exit 1
fi

TOTAL=$(ffprobe -v quiet -show_entries format=duration \
  -of csv=p=0 "$INPUT" 2>/dev/null | cut -d. -f1)
log "Source: $INPUT (${TOTAL}s total)"
log "Extracting: ${START}s → +${DURATION}s"
log "Output: $OUTPUT (${WIDTH}px wide, ${FPS}fps)"
log ""

# ── Pass 1: generate optimised palette from the source segment ───────────────
log "Pass 1/2 — Building colour palette…"
ffmpeg -y \
  -ss "$START" \
  -t  "$DURATION" \
  -i  "$INPUT" \
  -vf "fps=${FPS},scale=${WIDTH}:-1:flags=lanczos,palettegen=stats_mode=diff" \
  "$PALETTE" \
  -loglevel warning

# ── Pass 2: render GIF using palette ─────────────────────────────────────────
log "Pass 2/2 — Rendering GIF…"
ffmpeg -y \
  -ss "$START" \
  -t  "$DURATION" \
  -i  "$INPUT" \
  -i  "$PALETTE" \
  -lavfi "fps=${FPS},scale=${WIDTH}:-1:flags=lanczos [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" \
  "$OUTPUT" \
  -loglevel warning

SIZE=$(du -sh "$OUTPUT" | cut -f1)
log ""
log "Done!  $OUTPUT  (${SIZE})"
log ""
log "Reddit GIF tips:"
log "  • Reddit converts GIFs to mp4 on upload — uploading directly as GIF is fine."
log "  • If the file is >15MB, reduce duration or width:"
log "      ./scripts/make_gif.sh $INPUT $START 10 $OUTPUT"
log "      WIDTH=800 ./scripts/make_gif.sh ..."
log ""

# ── Also produce a Reddit-ready MP4 version of the same segment ──────────────
MP4_SEGMENT="${OUTPUT%.gif}-clip.mp4"
log "Bonus: also saving as MP4 clip (better quality for video posts)…"
ffmpeg -y \
  -ss "$START" \
  -t  "$DURATION" \
  -i  "$INPUT" \
  -vf "scale=${WIDTH}:-2" \
  -c:v libx264 \
  -crf 20 \
  -preset slow \
  -movflags +faststart \
  "$MP4_SEGMENT" \
  -loglevel warning

MP4_SIZE=$(du -sh "$MP4_SEGMENT" | cut -f1)
log "MP4 clip: $MP4_SEGMENT  (${MP4_SIZE})"
log ""
log "For a full-video Reddit post (better option for showcasing everything):"
log "  mpv /tmp/dshub-showcase.mp4          # preview full recording"
log "  # Upload /tmp/dshub-showcase.mp4 directly to Reddit's video uploader"
