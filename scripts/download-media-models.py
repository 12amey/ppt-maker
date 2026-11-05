"""Explicit, resumable download of the two models used by the local workflows."""
import argparse
import hashlib
import json
import os
from pathlib import Path
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
from huggingface_hub import hf_hub_download

parser = argparse.ArgumentParser()
parser.add_argument("--root", type=Path, required=True)
args = parser.parse_args()
models = [
    ("stable-diffusion-v1-5/stable-diffusion-v1-5", "v1-5-pruned-emaonly.safetensors", "models/checkpoints"),
    ("guoyww/animatediff", "mm_sd_v15_v2.ckpt", "models/animatediff_models"),
]
manifest = []
for repo, filename, subdir in models:
    print(f"Downloading {repo}/{filename}…", flush=True)
    destination = args.root / subdir
    destination.mkdir(parents=True, exist_ok=True)
    path = Path(hf_hub_download(repo_id=repo, filename=filename, local_dir=destination))
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    manifest.append({"repository": repo, "file": str(path), "sha256": digest.hexdigest(), "bytes": path.stat().st_size})
    print(f"Downloaded and hashed: {filename}", flush=True)
(args.root.parent / "media-model-manifest.json").write_text(json.dumps(manifest, indent=2))
