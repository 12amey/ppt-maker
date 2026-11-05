"""Local, deterministic PPTX checks. Text fit is an estimate, not rendered proof."""
from collections import Counter
from io import BytesIO
import math
from zipfile import BadZipFile, ZipFile
from lxml.etree import XMLSyntaxError

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.dml import MSO_COLOR_TYPE
from pptx.enum.shapes import MSO_SHAPE_TYPE


def open_presentation(content: bytes):
    try:
        with ZipFile(BytesIO(content)) as archive:
            if sum(member.file_size for member in archive.infolist()) > 250 * 1024 * 1024:
                raise ValueError("Expanded PowerPoint exceeds 250 MB")
            if "ppt/presentation.xml" not in archive.namelist():
                raise ValueError("Please upload a valid PPTX file")
        deck = Presentation(BytesIO(content))
        if not deck.slides:
            raise ValueError("This presentation has no slides")
        return deck
    except (BadZipFile, KeyError, OSError, XMLSyntaxError) as exc:
        raise ValueError("Please upload a valid, unencrypted PPTX file") from exc


def _shapes(shapes):
    for shape in shapes:
        yield shape
        if shape.shape_type == MSO_SHAPE_TYPE.GROUP:
            yield from _shapes(shape.shapes)


def _frames(shape):
    if shape.has_text_frame:
        yield shape.text_frame
    if shape.has_table:
        for row in shape.table.rows:
            for cell in row.cells:
                yield cell.text_frame


def _runs(deck):
    for slide in deck.slides:
        for shape in _shapes(slide.shapes):
            for frame in _frames(shape):
                for paragraph in frame.paragraphs:
                    yield from (run for run in paragraph.runs if run.text.strip())


def brand_profile(deck):
    fonts, colors = Counter(), Counter()
    # Include the source theme, since approved templates often use inherited fonts.
    for slide in deck.slides:
        theme = slide.slide_layout.slide_master.part
        for rel in theme.rels.values():
            if rel.reltype.endswith("/theme"):
                from lxml import etree
                root = etree.fromstring(rel.target_part.blob)
                ns = {"a": "http://schemas.openxmlformats.org/drawingml/2006/main"}
                for node in root.findall(".//a:fontScheme//a:latin", ns):
                    if node.get("typeface"):
                        fonts[node.get("typeface")] += 1
                for node in root.findall(".//a:clrScheme//a:srgbClr", ns):
                    colors[node.get("val").upper()] += 1
                break
        break
    for run in _runs(deck):
        if run.font.name:
            fonts[run.font.name] += 1
        if run.font.color.type == MSO_COLOR_TYPE.RGB:
            colors[str(run.font.color.rgb)] += 1
    return {"fonts": list(fonts), "colors": list(colors)}


def analyze_presentation(content: bytes, approved: bytes | None = None, fix: bool = False):
    deck = open_presentation(content)
    profile = brand_profile(open_presentation(approved)) if approved else None
    issues, fixes = [], []
    explicit_fonts = Counter(run.font.name for run in _runs(deck) if run.font.name)
    common_font = explicit_fonts.most_common(1)[0][0] if explicit_fonts else None

    def issue(slide, shape, category, message, suggestion, fixable=False, severity="warning"):
        item = {"id": f"issue-{len(issues) + 1}", "slide": slide, "shape": shape.name,
                "category": category, "severity": severity, "message": message,
                "suggestion": suggestion, "fixable": fixable, "fixed": False}
        issues.append(item)
        return item

    for slide_index, slide in enumerate(deck.slides, 1):
        # Group children use a transformed coordinate system. Bounds and alignment
        # checks intentionally apply only to top-level objects.
        for shape in slide.shapes:
            x, y, w, h = shape.left, shape.top, shape.width, shape.height
            if x < 0 or y < 0 or x + w > deck.slide_width + 12700 or y + h > deck.slide_height + 12700:
                can_fix = w <= deck.slide_width and h <= deck.slide_height and shape.rotation == 0
                item = issue(slide_index, shape, "alignment", "Object extends outside the slide",
                             "Move the object inside the slide, or confirm that the bleed is intentional.", can_fix)
                if fix and can_fix:
                    shape.left = max(0, min(x, deck.slide_width - w))
                    shape.top = max(0, min(y, deck.slide_height - h))
                    item["fixed"] = True
                    fixes.append(item["id"])

        text_boxes = []
        for shape in _shapes(slide.shapes):
            for frame in _frames(shape):
                frames_fonts, frames_colors = set(), set()
                small = False
                for paragraph in frame.paragraphs:
                    for run in paragraph.runs:
                        if not run.text.strip():
                            continue
                        font = run.font
                        if font.size and font.size.pt < 12:
                            small = True
                        name = font.name
                        color = str(font.color.rgb) if font.color.type == MSO_COLOR_TYPE.RGB else None
                        if profile and name and name.casefold() not in {f.casefold() for f in profile["fonts"]}:
                            frames_fonts.add(name)
                            if fix and profile["fonts"]:
                                font.name = profile["fonts"][0]
                        elif not profile and name and common_font and name != common_font:
                            frames_fonts.add(name)
                        if profile and color and color not in profile["colors"]:
                            frames_colors.add(color)
                            if fix and profile["colors"]:
                                rgb = tuple(int(color[i:i+2], 16) for i in (0, 2, 4))
                                nearest = min(profile["colors"], key=lambda c: sum((rgb[j] - int(c[j*2:j*2+2], 16))**2 for j in range(3)))
                                font.color.rgb = RGBColor.from_string(nearest)
                for category, values in (("fonts", frames_fonts), ("colors", frames_colors)):
                    if values:
                        can_fix = bool(profile and profile[category])
                        item = issue(slide_index, shape, category,
                                     ("Outside approved template: " if profile else "Font variation to review: ") + ", ".join(sorted(values)),
                                     "Use an approved template font or color." if profile else "Confirm this font variation is intentional.", can_fix)
                        item["fixed"] = fix and can_fix
                        if item["fixed"]:
                            fixes.append(item["id"])
                if small:
                    issue(slide_index, shape, "text", "Text smaller than 12 pt", "Increase small text if it is not a footnote.")

            if shape.has_text_frame and shape.text.strip():
                frame = shape.text_frame
                width = max(1, shape.width - frame.margin_left - frame.margin_right) / 12700
                height = max(1, shape.height - frame.margin_top - frame.margin_bottom) / 12700
                required = 0.0
                for paragraph in frame.paragraphs:
                    size = max([r.font.size.pt for r in paragraph.runs if r.font.size] or [paragraph.font.size.pt if paragraph.font.size else 18])
                    lines = sum(max(1, math.ceil(len(line) * size * 0.48 / width)) for line in paragraph.text.split("\n"))
                    required += lines * size * 1.15
                if required > height * 1.15:
                    issue(slide_index, shape, "text", "Possible text overflow (estimated)", "Review in PowerPoint; shorten text or enlarge its box.")
                if shape in slide.shapes:
                    text_boxes.append(shape)

        for i, first in enumerate(text_boxes):
            for second in text_boxes[i + 1:]:
                dx = min(first.left + first.width, second.left + second.width) - max(first.left, second.left)
                dy = min(first.top + first.height, second.top + second.height) - max(first.top, second.top)
                if dx > 2 * 12700 and dy > 2 * 12700:
                    issue(slide_index, first, "alignment", f'Text box overlaps "{second.name}"', "Review the two text boxes; some overlaps may be intentional.")

    output = None
    if fix:
        buffer = BytesIO()
        deck.save(buffer)
        output = buffer.getvalue()
    report = {
        "slide_count": len(deck.slides), "issues": issues, "fixed_count": len(fixes),
        "issue_count": len(issues), "remaining_count": len(issues) - len(fixes),
        "categories": dict(Counter(item["category"] for item in issues)),
        "brand_profile": profile,
        "limitations": "Text fit and overlaps are estimates. Group geometry, embedded image text, inherited formatting, and full brand layout compliance require visual review in PowerPoint.",
    }
    return report, output
