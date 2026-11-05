import asyncio
from io import BytesIO
from unittest.mock import patch
import pytest
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor

from services.presentation_quality import analyze_presentation, open_presentation
from services.template_preservation import preserve_source_layout
from templates.v2.models.layouts import RawSlideLayout
from services.video_generation_service import DEFAULT_VIDEO_WORKFLOW, VideoGenerationService


def test_local_source_resolves_docker_ollama_hostname(monkeypatch):
    from utils.get_env import get_ollama_url_env
    monkeypatch.setenv("OLLAMA_URL", "http://host.docker.internal:11434")
    monkeypatch.setenv("PRESENTON_LOCAL_SOURCE", "true")
    assert get_ollama_url_env() == "http://127.0.0.1:11434"
    monkeypatch.delenv("PRESENTON_LOCAL_SOURCE")
    assert get_ollama_url_env() == "http://host.docker.internal:11434"


def deck_bytes(font="Arial", color="123456", outside=False):
    deck = Presentation()
    slide = deck.slides.add_slide(deck.slide_layouts[6])
    box = slide.shapes.add_textbox(Inches(-0.2 if outside else 1), Inches(1), Inches(3), Inches(1))
    run = box.text_frame.paragraphs[0].add_run()
    run.text = "Quarterly update"
    run.font.name = font
    run.font.size = Pt(24)
    run.font.color.rgb = RGBColor.from_string(color)
    stream = BytesIO()
    deck.save(stream)
    return stream.getvalue()


def test_quality_fixes_separate_copy_and_preserves_text():
    source = deck_bytes("Comic Sans MS", "FF0011", outside=True)
    report, output = analyze_presentation(source, deck_bytes(), fix=True)
    assert {"fonts", "colors", "alignment"} <= set(report["categories"])
    assert report["fixed_count"] == 3
    corrected = open_presentation(output).slides[0].shapes[0]
    assert corrected.left == 0
    assert corrected.text == "Quarterly update"
    assert corrected.text_frame.paragraphs[0].runs[0].font.name in report["brand_profile"]["fonts"]
    assert open_presentation(source).slides[0].shapes[0].left < 0


def test_quality_without_brand_does_not_replace_font():
    content = deck_bytes("Comic Sans MS")
    report, output = analyze_presentation(content, fix=True)
    assert report["brand_profile"] is None
    assert open_presentation(output).slides[0].shapes[0].text_frame.paragraphs[0].runs[0].font.name == "Comic Sans MS"


def test_quality_rejects_invalid_package():
    with pytest.raises(ValueError):
        analyze_presentation(b"not a zip")


def test_empty_template_and_source_geometry_are_preserved():
    raw = RawSlideLayout(id="empty", description="Blank template slide", elements=[])
    assert preserve_source_layout(raw, 0).components == []
    raw = RawSlideLayout.model_validate({"id": "original", "description": "Original content", "elements": [{"type": "text", "position": {"x": 40, "y": 70}, "size": {"width": 500, "height": 100}, "font": {"family": "Arial", "size": 32}, "runs": [{"text": "Title"}], "name": "title", "decorative": False, "max_length": 80, "min_length": 40}]})
    saved = preserve_source_layout(raw, 0)
    assert saved.components[0].position.x == 0
    assert saved.components[0].elements[0].position == raw.elements[0].position
    assert saved.components[0].elements[0].font == raw.elements[0].font
    assert saved.components[0].elements[0].runs == raw.elements[0].runs
    assert saved.components[0].elements[0].decorative is False
    assert saved.components[0].elements[0] is not raw.elements[0]


def test_default_video_workflow_has_valid_model_links_and_sampler():
    assert DEFAULT_VIDEO_WORKFLOW["4"]["class_type"] == "ADE_AnimateDiffLoaderGen1"
    assert DEFAULT_VIDEO_WORKFLOW["7"]["inputs"]["model"] == ["4", 0]
    assert DEFAULT_VIDEO_WORKFLOW["7"]["inputs"]["scheduler"] == "normal"


def test_video_ignores_image_outputs(tmp_path):
    service = VideoGenerationService(str(tmp_path))
    from unittest.mock import AsyncMock
    service._download_file = AsyncMock(return_value="clip.mp4")
    entry = {"outputs": {"1": {"images": [{"filename": "preview.png"}]}, "2": {"gifs": [{"filename": "clip.mp4"}]}}}
    assert asyncio.run(service._download_output(None, "http://local", entry, "job")) == "clip.mp4"
    assert service._download_file.call_args.args[2] == "clip.mp4"


def test_preserved_template_routes_never_call_ai(fake_async_session):
    from api.v1.ppt.endpoints.template import (
        CreateTemplateLayoutsRequest, GenerateTemplateBlocksRequest,
        create_template_slide_layouts, generate_template_blocks,
    )
    from models.sql.template_v2 import TemplateV2
    raw = {"layouts": [{"id": "blank", "description": "Blank slide", "elements": []}]}
    template = TemplateV2(id="preserve-test", name="Local template", raw_layouts=raw,
                          assets={"import_mode": "preserve"})
    fake_async_session._get_results[template.id] = template
    with patch("api.v1.ppt.endpoints.template._run_template_generation_thread", side_effect=AssertionError("Must not call AI")):
        response = asyncio.run(create_template_slide_layouts(CreateTemplateLayoutsRequest(template_id=template.id, index=0), sql_session=fake_async_session))
        template.layouts = {"layouts": [response.layouts[0].layout.model_dump(mode="json")]}
        asyncio.run(generate_template_blocks(GenerateTemplateBlocksRequest(template_id=template.id), sql_session=fake_async_session))
    assert template.merged_components == {"components": []}
