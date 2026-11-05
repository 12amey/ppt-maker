"""Convert source geometry into editable layouts without an LLM round trip."""
from copy import deepcopy
import re

from templates.v2.models.layouts import Component, Position, RawSlideLayout, SlideLayout


def preserve_source_layout(raw: RawSlideLayout, index: int) -> SlideLayout:
    # A component at the origin keeps every source element in its original space.
    # Empty slides are valid layouts and can be populated in the editor.
    elements = deepcopy(raw.elements)
    def annotate(element, path):
        kind = getattr(element, "type", "")
        if kind in {"text", "text-list", "table", "chart", "infographic"}:
            name = getattr(element, "name", "") or ""
            fixed = bool(re.search(r"footer|copyright|slide.?number|logo", name, re.I))
            element.decorative = fixed
            element.name = f"source_{path}"
            if kind == "text" and not fixed and element.max_length < 2:
                element.max_length = 80
                element.min_length = 40
        child = getattr(element, "child", None)
        if child is not None:
            annotate(child, f"{path}_child")
        for i, child in enumerate(getattr(element, "children", None) or []):
            annotate(child, f"{path}_{i}")
    for i, element in enumerate(elements):
        annotate(element, str(i))
    return SlideLayout(
        id=f"source_slide_{index + 1}",
        description=raw.description or f"Original slide {index + 1}",
        components=[Component(
            id=f"source_content_{index + 1}",
            description="Original editable slide content",
            position=Position(x=0, y=0),
            elements=elements,
        )] if elements else [],
    )
