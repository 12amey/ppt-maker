"""Exercise actual local endpoints using a disposable two-slide test deck."""
from io import BytesIO
import json
from pathlib import Path
import httpx
from pptx import Presentation
from pptx.util import Inches, Pt

root = Path(__file__).resolve().parent.parent
deck = Presentation()
deck.slides.add_slide(deck.slide_layouts[6])
slide = deck.slides.add_slide(deck.slide_layouts[6])
shape = slide.shapes.add_textbox(Inches(-0.2), Inches(1), Inches(5), Inches(1))
run = shape.text_frame.paragraphs[0].add_run()
run.text = "Editable template content"
run.font.name = "Arial"
run.font.size = Pt(32)
stream = BytesIO()
deck.save(stream)
content = stream.getvalue()
out = root / ".cache/creative-hub"
(out / "smoke-template.pptx").write_bytes(content)
with httpx.Client(base_url="http://127.0.0.1:8000", timeout=240) as client:
    response = client.post("/api/v1/quality/analyze", files={"file": ("smoke.pptx", content)}, data={"fix": "true"})
    response.raise_for_status()
    report = response.json()
    assert report["slide_count"] == 2 and report["fixed_count"] >= 1
    assert client.get(report["corrected_url"]).status_code == 200
    print("PASS: quality analysis, correction and PPTX download", flush=True)
    response = client.post("/api/v1/ppt/template/fonts-upload-and-slides-preview", files={"pptx_file": ("smoke.pptx", content)})
    response.raise_for_status()
    preview = response.json()
    assert len(preview["slide_image_urls"]) == 2
    print("PASS: real PPTX upload and two rendered previews", flush=True)
    response = client.post("/api/v1/ppt/template/init", json={"pptx_url": preview["modified_pptx_url"], "slide_image_urls": preview["slide_image_urls"], "fonts": preview["fonts"], "name": "Creative Hub smoke test", "import_mode": "preserve"})
    response.raise_for_status()
    template_id = response.json()
    layouts = []
    for index in range(2):
        response = client.post("/api/v1/ppt/template/layouts/create", json={"template_id": template_id, "index": index})
        response.raise_for_status()
        layouts.extend(response.json()["layouts"])
    response = client.patch(f"/api/v1/ppt/template/{template_id}/layouts", json={"layouts": layouts})
    response.raise_for_status()
    response = client.post("/api/v1/ppt/template/generate-blocks", json={"template_id": template_id})
    response.raise_for_status()
    (out / "smoke-result.json").write_text(json.dumps({"template_id": template_id, "preview": preview, "layouts": layouts, "quality": report}, indent=2))
    print(f"PASS: native import, editable layouts and saved reusable blocks ({template_id})", flush=True)
