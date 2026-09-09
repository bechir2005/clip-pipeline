#!/usr/bin/env python3
"""
server.py — thin HTTP wrapper around render.py, so Cloud Run can trigger
a render job with a simple POST request instead of needing a shell.

POST /render
  body: the manifest.json content (from the review tool)
  returns: {"status": "ok", "output_url": "https://.../final_<id>.mp4"}

The rendered file is uploaded to the S3 bucket named by OUTPUT_BUCKET,
using credentials from the standard AWS env vars:
  AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION, OUTPUT_BUCKET

For a first deploy without S3 output wired up yet, set RETURN_MODE=local
and it will just report the container-local path (useful for testing
via `gcloud run services proxy` / logs).
"""

import os
import uuid
import tempfile
from pathlib import Path

from flask import Flask, request, jsonify

import render as render_lib

app = Flask(__name__)

OUTPUT_BUCKET = os.environ.get("OUTPUT_BUCKET")
RETURN_MODE = os.environ.get("RETURN_MODE", "s3")  # "s3" or "local"
SFX_DIR = os.environ.get("SFX_DIR", "./sfx")


@app.get("/")
def health():
    return jsonify({"status": "healthy"})


@app.post("/render")
def render_endpoint():
    manifest = request.get_json(force=True)
    clips = sorted(manifest.get("clips", []), key=lambda c: c["order"])
    if not clips:
        return jsonify({"status": "error", "message": "no clips in manifest"}), 400

    job_id = uuid.uuid4().hex[:10]

    with tempfile.TemporaryDirectory() as tmp:
        workdir = Path(tmp)
        edited = []
        for i, clip in enumerate(clips):
            edited.append(render_lib.process_clip(clip, workdir, SFX_DIR, i))

        out_path = workdir / f"final_{job_id}.mp4"
        render_lib.concat_clips(edited, out_path, workdir)

        if RETURN_MODE == "local":
            return jsonify({"status": "ok", "output_path": str(out_path), "note": "local mode, not uploaded"})

        # Upload to S3
        import boto3
        s3 = boto3.client("s3")
        key = f"rendered/{job_id}.mp4"
        s3.upload_file(str(out_path), OUTPUT_BUCKET, key)
        url = f"https://{OUTPUT_BUCKET}.s3.amazonaws.com/{key}"
        return jsonify({"status": "ok", "output_url": url})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
