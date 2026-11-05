"""Verify the imported template can be filled and exported with the local LLM."""
import json
from pathlib import Path
import httpx
from pptx import Presentation

root = Path(__file__).resolve().parent.parent
result = json.loads((root / ".cache/creative-hub/smoke-result.json").read_text())
with httpx.Client(base_url="http://127.0.0.1:8000", timeout=300) as client:
    response = client.post("/api/v1/ppt/presentation/generate", json={
        "content": "Create one slide. Title: Release update.",
        "slides_markdown": ["# Release update"], "n_slides": 1,
        "include_title_slide": False, "include_table_of_contents": False,
        "instructions": "Use source_slide_2. Replace its text with Release update. Preserve the design.",
        "language": "English", "template": result["template_id"],
        "export_as": "pptx",
    })
    if response.status_code != 200:
        print(response.status_code, response.text[:1800], flush=True)
        response.raise_for_status()
    generated = response.json()
    deck = Presentation(generated["path"])
    texts = [shape.text for slide in deck.slides for shape in slide.shapes if shape.has_text_frame]
    assert len(deck.slides) == 1 and any("Release update" in text for text in texts)
    (root / ".cache/creative-hub/generation-result.json").write_text(json.dumps(generated, indent=2))
    print("PASS: local LLM filled the imported template and exported PPTX", flush=True)
    print(json.dumps(generated), flush=True)
