#!/usr/bin/env python3
"""
render.py — turns an approved clip manifest into a final edited video.

Pipeline:
  1. Download each approved clip (from its S3/Drive URL) to a temp dir.
  2. For clips with webcam_zoom.enabled, apply a zoom-crop on the webcam
     region (using the relative x/y/w/h box picked in the review tool)
     over the final ZOOM_DURATION seconds of that clip.
  3. Overlay the chosen sound effect at sfx_time (or clip end if not given).
  4. Concatenate all clips in manifest order into one output file.

Usage:
    python render.py manifest.json --sfx-dir ./sfx --out final.mp4

manifest.json schema (produced by the review tool):
{
  "clips": [
    {
      "id": "abc123",
      "url": "https://.../clip_001.mp4",
      "order": 1,
      "sfx": "airhorn" | null,
      "sfx_time": "0:07" | null,
      "webcam_zoom": {
        "enabled": true,
        "crop": {"x": 0.7, "y": 0.6, "w": 0.25, "h": 0.35},
        "apply_at": "end"
      }
    }
  ]
}

Requirements:
  - ffmpeg on PATH
  - pip install requests --break-system-packages
  - sfx-dir containing files named <name>.mp3 matching the "sfx" values
    used in the review tool (e.g. airhorn.mp3, vine_boom.mp3)
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import shutil
from pathlib import Path

ZOOM_DURATION = 3.0   # seconds of zoom effect at the end of a flagged clip
ZOOM_SCALE = 2.0       # how much to magnify the cropped webcam region


def run(cmd):
    print("  $", " ".join(cmd))
    subprocess.run(cmd, check=True)


def download(url, dest):
    import requests
    r = requests.get(url, stream=True, timeout=60)
    r.raise_for_status()
    with open(dest, "wb") as f:
        shutil.copyfileobj(r.raw, f)


def probe_duration(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(out.stdout.strip())


def parse_timestamp(ts, fallback):
    if not ts:
        return fallback
    ts = str(ts).strip()
    if ":" in ts:
        parts = [float(p) for p in ts.split(":")]
        secs = 0
        for p in parts:
            secs = secs * 60 + p
        return secs
    return float(ts)


def build_zoom_filter(crop, duration, zoom_duration):
    """
    Builds an ffmpeg filter that plays the clip normally, then over the
    final `zoom_duration` seconds smoothly pushes in on the cropped
    webcam region defined by relative x/y/w/h (0-1).
    """
    x, y, w, h = crop["x"], crop["y"], crop["w"], crop["h"]
    zoom_start = max(0, duration - zoom_duration)
    # Two segments: normal playback, then a crop+scale zoom on the webcam box.
    # in_w/in_h resolve at filter time against the actual clip resolution.
    filt = (
        f"[0:v]split=2[main][zoomsrc];"
        f"[main]trim=0:{zoom_start},setpts=PTS-STARTPTS[v0];"
        f"[zoomsrc]trim={zoom_start}:{duration},setpts=PTS-STARTPTS,"
        f"crop=iw*{w}:ih*{h}:iw*{x}:ih*{y},"
        f"scale=iw*{ZOOM_SCALE}:ih*{ZOOM_SCALE}:eval=frame,"
        f"scale=1920:1080:force_original_aspect_ratio=decrease,"
        f"pad=1920:1080:(ow-iw)/2:(oh-ih)/2[v1];"
        f"[v0][v1]concat=n=2:v=1:a=0[vout]"
    )
    return filt


def process_clip(clip, workdir, sfx_dir, index):
    raw_path = workdir / f"raw_{index}.mp4"
    print(f"\n[{index}] downloading {clip['url']}")
    download(clip["url"], raw_path)

    duration = probe_duration(raw_path)
    zoom = clip.get("webcam_zoom", {}) or {}
    sfx_name = clip.get("sfx")
    sfx_time = parse_timestamp(clip.get("sfx_time"), duration - 1)

    out_path = workdir / f"edited_{index}.mp4"

    filter_complex_parts = []
    video_out = "0:v"
    audio_inputs = ["-i", str(raw_path)]
    map_args = []

    if zoom.get("enabled"):
        vf = build_zoom_filter(zoom["crop"], duration, ZOOM_DURATION)
        filter_complex_parts.append(vf)
        video_out = "[vout]"

    audio_filter = None
    extra_inputs = []
    if sfx_name:
        sfx_path = Path(sfx_dir) / f"{sfx_name}.mp3"
        if not sfx_path.exists():
            print(f"  ! warning: sfx file not found: {sfx_path} — skipping sfx")
        else:
            extra_inputs = ["-i", str(sfx_path)]
            delay_ms = int(sfx_time * 1000)
            audio_filter = (
                f"[1:a]adelay={delay_ms}|{delay_ms}[sfxdelayed];"
                f"[0:a][sfxdelayed]amix=inputs=2:duration=first:dropout_transition=0[aout]"
            )

    cmd = ["ffmpeg", "-y", "-i", str(raw_path)] + extra_inputs

    fc_parts = list(filter_complex_parts)
    if audio_filter:
        fc_parts.append(audio_filter)

    if fc_parts:
        cmd += ["-filter_complex", ";".join(fc_parts)]
        cmd += ["-map", video_out if zoom.get("enabled") else "0:v"]
        cmd += ["-map", "[aout]" if audio_filter else "0:a"]
    else:
        cmd += ["-map", "0:v", "-map", "0:a"]

    cmd += ["-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac", str(out_path)]
    run(cmd)
    return out_path


def concat_clips(paths, out_file, workdir):
    list_file = workdir / "concat_list.txt"
    with open(list_file, "w") as f:
        for p in paths:
            f.write(f"file '{p.resolve()}'\n")
    run([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0",
        "-i", str(list_file), "-c", "copy", str(out_file),
    ])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("manifest", help="Path to manifest.json from the review tool")
    ap.add_argument("--sfx-dir", default="./sfx", help="Folder with <name>.mp3 sound effects")
    ap.add_argument("--out", default="final.mp4", help="Output video path")
    args = ap.parse_args()

    manifest = json.loads(Path(args.manifest).read_text())
    clips = sorted(manifest["clips"], key=lambda c: c["order"])
    if not clips:
        print("No approved clips in manifest.")
        sys.exit(1)

    with tempfile.TemporaryDirectory() as tmp:
        workdir = Path(tmp)
        edited = []
        for i, clip in enumerate(clips):
            edited.append(process_clip(clip, workdir, args.sfx_dir, i))
        print(f"\nConcatenating {len(edited)} clips -> {args.out}")
        concat_clips(edited, Path(args.out), workdir)

    print(f"\nDone: {args.out}")


if __name__ == "__main__":
    main()
