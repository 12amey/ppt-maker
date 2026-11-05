"use client";
import { useEffect, useState } from "react";
import { Download, ImageIcon, Video, Loader2, RefreshCw } from "lucide-react";
import { getApiUrl, getApiErrorMessage, resolveBackendAssetUrl } from "@/utils/api";
import { StudioPage, fieldClass, panelClass, primaryClass, secondaryClass } from "./StudioPage";

type Status = { available: boolean; message: string; image_ready: boolean; video_ready: boolean; missing: string[] };
export default function MediaStudio({ mode }: { mode: "image" | "video" }) {
  const video = mode === "video";
  const [status, setStatus] = useState<Status | null>(null);
  const [checking, setChecking] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [sourceImage, setSourceImage] = useState<File | null>(null);
  const [sourcePreview, setSourcePreview] = useState("");
  const [strength, setStrength] = useState(0.65);
  const [size, setSize] = useState(video ? "256x256" : "512x512");
  const [frames, setFrames] = useState(8);
  const [fps, setFps] = useState(8);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [output, setOutput] = useState("");
  useEffect(() => {
    if (!sourceImage) { setSourcePreview(""); return; }
    const previewUrl = URL.createObjectURL(sourceImage);
    setSourcePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [sourceImage]);
  async function check() {
    setChecking(true);
    try {
      const response = await fetch(getApiUrl("/api/v1/media/comfyui-status"), { credentials: "include" });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, "Cannot check ComfyUI"));
      setStatus(await response.json());
    } catch (e) { setStatus({ available: false, image_ready: false, video_ready: false, missing: [], message: e instanceof Error ? e.message : "Backend unavailable" }); }
    finally { setChecking(false); }
  }
  useEffect(() => { void check(); }, []);
  const ready = video ? status?.video_ready : status?.image_ready;
  async function generate() {
    if (!prompt.trim()) return;
    setBusy(true); setError(""); setOutput("");
    const [width, height] = size.split("x").map(Number);
    try {
      let body: BodyInit;
      const headers: Record<string, string> = {};
      if (video) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify({ prompt: prompt.trim(), width, height, num_frames: frames, fps });
      } else {
        const form = new FormData();
        form.append("prompt", prompt.trim());
        form.append("width", String(width));
        form.append("height", String(height));
        form.append("strength", String(strength));
        if (sourceImage) form.append("image", sourceImage);
        body = form;
      }
      const isDirectLoopback =
        typeof window !== "undefined" &&
        (window.location.hostname === "localhost" ||
          window.location.hostname === "127.0.0.1");
      const localVideoApi =
        video &&
        isDirectLoopback &&
        process.env.NODE_ENV === "development" &&
        process.env.NEXT_PUBLIC_FAST_API
          ? `${process.env.NEXT_PUBLIC_FAST_API.replace(/\/+$/, "")}/api/v1/media/generate-video`
          : getApiUrl(`/api/v1/media/generate-${mode}`);
      const response = await fetch(localVideoApi, { method: "POST", credentials: "include", headers, body });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, "Generation failed"));
      const data = await response.json();
      setOutput(resolveBackendAssetUrl(video ? data.video_url : data.image_url));
    } catch (e) { setError(e instanceof Error ? e.message : "Generation failed"); }
    finally { setBusy(false); }
  }
  const Icon = video ? Video : ImageIcon;
  return <StudioPage eyebrow={video ? "04 / Motion studio" : "03 / Image studio"} title={video ? "Turn an idea into motion" : "Create or edit an image"} description={video ? "Generate short local video clips with ComfyUI and AnimateDiff. Begin at 256 × 256 with 8 frames on the 4 GB GPU, then increase settings if memory allows." : "Generate an image from a prompt or add an existing image and describe how you want to change it. Everything runs locally with ComfyUI."}>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"><div><p className="text-sm font-medium">{checking ? "Checking local engine…" : ready ? "Local engine ready" : "Local setup required"}</p><p className="mt-1 text-xs text-slate-500">{status?.message ?? "Connecting to ComfyUI"}</p></div><button className={secondaryClass} onClick={check} disabled={checking || busy}><RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`}/>Check connection</button></div>
    <div className="grid gap-5 xl:grid-cols-[minmax(300px,0.85fr)_minmax(300px,1.15fr)]"><section className={panelClass}><h2 className="mb-5 font-semibold">{video ? "Describe your video" : sourceImage ? "Edit an existing image" : "Create an image"}</h2>
      {!video && <div className="mb-5"><label className="text-sm font-medium" htmlFor="source-image">Existing image (optional)</label><input key={sourceImage?.name ?? "empty-image"} id="source-image" type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setSourceImage(e.target.files?.[0] ?? null)} disabled={busy} className={`${fieldClass} mt-2 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-violet-700`}/><p className="mt-1 text-xs text-slate-500">PNG, JPEG, or WebP · up to 12 MB</p>{sourcePreview && <div className="mt-3 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2"><img src={sourcePreview} alt="Selected image to edit" className="h-16 w-16 rounded object-cover"/><span className="min-w-0 flex-1 truncate text-xs text-slate-600">{sourceImage?.name}</span><button type="button" className="text-xs font-medium text-violet-700" onClick={() => setSourceImage(null)} disabled={busy}>Remove</button></div>}</div>}
      <label className="text-sm font-medium" htmlFor="media-prompt">{sourceImage ? "Describe the changes" : "Prompt"}</label><textarea id="media-prompt" value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={2000} rows={6} className={`${fieldClass} mt-2 resize-y`} placeholder={video ? "Soft light moving across an abstract blue glass sculpture, slow camera movement" : sourceImage ? "For example: change the background to a warm sunset and keep the subject unchanged" : "A modern city skyline at sunrise, clean composition, space on the left for a slide title"} disabled={busy}/><p className="mt-1 text-right text-xs text-slate-400">{prompt.length}/2000</p>
      {sourceImage && <label className="mt-4 block text-sm">Change strength <span className="float-right font-medium text-violet-700">{Math.round(strength * 100)}%</span><input type="range" min="0.1" max="0.9" step="0.05" value={strength} onChange={e => setStrength(Number(e.target.value))} disabled={busy} className="mt-2 w-full accent-violet-600"/><span className="block text-xs text-slate-500">Lower keeps more of the original; higher allows larger changes.</span></label>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{(!sourceImage || video) && <label className="space-y-2 text-sm">Output size<select value={size} onChange={e => setSize(e.target.value)} disabled={busy} className={fieldClass}>{video && <option value="256x256">256 × 256 · lowest memory</option>}<option value="512x512">512 × 512 · square</option><option value="768x512">768 × 512 · landscape</option><option value="512x768">512 × 768 · portrait</option></select></label>}{sourceImage && <p className="self-center text-xs leading-5 text-slate-500">The edited result keeps the original image proportions and is resized for this computer.</p>}{video && <><label className="space-y-2 text-sm">Frames<select value={frames} onChange={e => setFrames(Number(e.target.value))} disabled={busy} className={fieldClass}><option value={8}>8 · quick test</option><option value={16}>16 · short clip</option><option value={24}>24 · more memory</option></select></label><label className="space-y-2 text-sm">Frames per second<select value={fps} onChange={e => setFps(Number(e.target.value))} disabled={busy} className={fieldClass}><option value={8}>8 fps</option><option value={12}>12 fps</option><option value={16}>16 fps</option></select></label></>}</div>
      <button className={`${primaryClass} mt-6 w-full`} onClick={generate} disabled={busy || !ready || !prompt.trim()}>{busy ? <Loader2 className="h-4 w-4 animate-spin"/> : <Icon className="h-4 w-4"/>}{busy ? "Generating locally…" : sourceImage ? "Edit image" : `Generate ${mode}`}</button>{busy && <p role="status" className="mt-3 text-xs leading-5 text-slate-500">Generation may take several minutes on 4 GB VRAM. Keep this page open.</p>}{error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </section><section className={`${panelClass} flex min-h-[420px] flex-col items-center justify-center bg-slate-50`} aria-label="Generation result">{output ? <><div className="flex min-h-0 w-full flex-1 items-center justify-center">{video ? <video src={output} controls className="max-h-[500px] max-w-full rounded-xl"/> : <img src={output} alt={prompt} className="max-h-[500px] max-w-full rounded-xl object-contain"/>}</div><a className={`${secondaryClass} mt-5`} href={output} download><Download className="h-4 w-4"/>Download {mode}</a></> : <div className="px-8 text-center"><Icon className="mx-auto mb-4 h-10 w-10 text-violet-300"/><h2 className="font-medium">{busy ? "Creating your visual" : `Your ${mode} will appear here`}</h2><p className="mt-2 text-sm text-slate-500">{video ? `${frames} frames at ${fps} fps · ${(frames / fps).toFixed(1)} second clip` : "Preview and download the generated image."}</p></div>}</section></div>
    {!ready && !checking && <section className={`${panelClass} mt-6`}><h2 className="font-semibold">Free local setup</h2><p className="mt-2 text-sm leading-6 text-slate-600">From the project folder, run <code className="rounded bg-slate-100 px-1">.\setup-local-media.ps1</code>, then <code className="rounded bg-slate-100 px-1">.\start-local-media.ps1</code>. Installation downloads the engine, GPU dependencies, and model weights. See <strong>CREATIVE-HUB-SETUP.md</strong> for hardware limits and higher quality options.</p>{!!status?.missing?.length && <ul className="mt-3 list-inside list-disc text-sm leading-7 text-amber-700">{(video ? status.missing : status.missing.filter(m => m.startsWith("SD 1.5"))).map(m => <li key={m}>{m}</li>)}</ul>}</section>}
  </StudioPage>;
}
