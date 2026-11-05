# Creative Hub setup and usage

## Start the updated project

Run from this project folder in PowerShell:

```powershell
.\start-creative-hub.ps1
```

Open **http://localhost:3000/ppt-maker**. This runs the edited source on Windows: Next.js on port 3000 and FastAPI on port 8000. The old `start-presenton.ps1` uses the official Docker image on port 5001; that image does not contain these changes.

The existing `app_data` database, templates, and presentations are reused. A database copy is saved before the first source launch at `.cache/creative-hub/fastapi-before-creative-hub.db`. Stop the source servers with `stop-creative-hub.ps1`. Logs are under `.cache/creative-hub/`.

If dependencies are missing:

```powershell
npm install
Set-Location servers/nextjs
npm install
Set-Location ../fastapi
uv sync --group dev
Set-Location ../..
npm run sync:presentation-export
```

The presentation exporter uses installed Chrome. If Chrome is in another location, set `PUPPETEER_EXECUTABLE_PATH` before starting the source launcher.

## 1. PPT Maker: two ways to start

1. Choose **Blank page** to open a clean editable presentation.
2. Choose **Edit a PowerPoint** to upload and work from an existing `.pptx` template.
3. In the editor, use the side shortcuts for **Charts** and **Infographics**. Charts can be inserted from presets or imported from CSV; use **Add photo** to add an image element to the slide.
4. Set the slide's visible safe margin from the number control in the slide corner. The dashed line is an editing guide.
5. Export the edited presentation from the editor's download controls.

PowerPoint features unsupported by the existing converter may change appearance during import. Text placeholders are identified using object types and names, so inspect imported templates before approving their content schema. Source import does not guarantee pixel-identical treatment of SmartArt, animations, embedded objects, or unusual aspect ratios.

## 2. Design Ops dashboard

The dashboard is a functional demo: create requests with owner, team and due date; change status; search/filter; remove demo requests. Counts and workload bars update immediately. Changes persist in this browser's local storage. The formatting-issues donut is clearly marked sample data. This is not a shared team database.

## 3. PowerPoint quality analysis

Upload a `.pptx` up to 40 MB. Optionally add an approved brand template. Analyze actual slide objects for objects outside slide boundaries, possible text overflow, overlapping text boxes, small text, font variations and explicit text colors outside the approved palette.

Filter findings by type and slide, and download the JSON report. **Apply safe corrections** creates a separate downloadable PPTX. It moves unrotated objects inside the slide when they fit; with an approved template it replaces explicit unapproved fonts/colors. Original uploads are not overwritten. All corrections should be reviewed because deliberate edge bleed or accent typography may be intentional.

Text fit and overlaps are estimates, not a PowerPoint rendering test. Group-coordinate alignment, text inside images, inherited formatting and full brand layout compliance require manual review. Unsupported checks are not treated as passes.

Select **Load slide previews** to render the uploaded slides, then use the clickable thumbnails to review findings for a particular slide. These previews use the existing converter and show the uploaded version; download the corrected copy separately.

## 4. Free local image and video generation

Detected hardware: **NVIDIA RTX 3050 Laptop, 4 GB VRAM**. The included baseline uses **Stable Diffusion 1.5** for images and **AnimateDiff v2** for short experimental clips. These run locally without per-generation API fees. Downloads are several GB, plus GPU libraries. Free software does not imply unrestricted model licensing; review the linked model cards before using outputs commercially.

Install (resumable model downloads):

```powershell
.\setup-local-media.ps1
.\start-local-media.ps1
```

The installer reuses `tools/ComfyUI` or clones the official repo if absent, creates its own Python 3.12 environment, installs NVIDIA PyTorch and ComfyUI dependencies, clones AnimateDiff-Evolved and VideoHelperSuite, and downloads the exact checkpoint and motion model used by the bundled workflows. SHA-256 hashes of downloaded files are recorded in `tools/media-model-manifest.json`.

Start ComfyUI before using either media page. It binds to **127.0.0.1:8188** and starts with `--lowvram`, disabled previews and PyTorch attention. The pages check both connection and required nodes/models. ComfyUI logs are saved beside the application logs. To stop only ComfyUI:

```powershell
Stop-Process -Id (Get-Content .cache/creative-hub/comfyui.pid)
```

Suggested starting settings for this machine:

| Task | Starting settings | Practical limit |
| --- | --- | --- |
| Image | 512 × 512, 24 steps | Older model; text, faces and fine detail may need editing |
| Video | 256 × 256, 8 frames at 8 fps | A 1-second motion test; memory and speed vary |
| Longer video | Try 16 frames only after an 8-frame success | May exhaust 4 GB VRAM; reduce resolution or frames |

Keep other GPU applications closed during generation. If Ollama is using GPU memory, unload its model from Ollama before starting a media job. Local rendering may take minutes. A downloaded checkpoint is not enough: the engine, custom nodes, motion model and video encoder must all load successfully. Pages show errors rather than substitute sample results.

For higher image quality, try SDXL on a machine with more memory or a separately tested low-memory workflow. For substantially better video, use an official Wan2.2 workflow on suitable larger hardware; it is not the default for this 4 GB laptop. The video backend accepts an API-format custom workflow through `COMFYUI_VIDEO_WORKFLOW`; label its positive text node **Input Prompt** and preserve required model links. Built-in frame/size controls support EmptyLatentImage workflows; other custom latent nodes retain their workflow's settings. The existing image-provider Settings also supports a custom ComfyUI workflow. Free hosted GPU sessions may have quotas and availability limits; this project does not promise unlimited free hosted generation.

Sources and repositories:

- [ComfyUI manual installation](https://docs.comfy.org/installation/manual_install)
- [ComfyUI repository](https://github.com/Comfy-Org/ComfyUI)
- [Stable Diffusion 1.5 model card and checkpoint](https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5)
- [AnimateDiff motion models](https://huggingface.co/guoyww/animatediff)
- [AnimateDiff-Evolved](https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved)
- [VideoHelperSuite](https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite)
- [Official Wan2.2 ComfyUI examples](https://comfyanonymous.github.io/ComfyUI_examples/wan22/)
