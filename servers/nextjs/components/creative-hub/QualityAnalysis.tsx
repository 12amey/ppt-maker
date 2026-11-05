"use client";
import { useState } from "react";
import { Download, FileCheck2, Loader2, ShieldCheck, Wrench } from "lucide-react";
import { getApiUrl, getApiErrorMessage, resolveBackendAssetUrl } from "@/utils/api";
import { StudioPage, fieldClass, panelClass, primaryClass, secondaryClass } from "./StudioPage";

type Issue = { id: string; slide: number; shape: string; category: string; severity: string; message: string; suggestion: string; fixable: boolean; fixed: boolean };
type Report = { filename: string; slide_count: number; issue_count: number; fixed_count: number; remaining_count: number; issues: Issue[]; categories: Record<string, number>; corrected_url?: string; limitations: string; brand_profile?: { fonts: string[]; colors: string[] } };

export default function QualityAnalysis() {
  const [file, setFile] = useState<File | null>(null);
  const [brand, setBrand] = useState<File | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("all");
  const [slide, setSlide] = useState("all");
  const [previews, setPreviews] = useState<string[]>([]);
  const [previewSlide, setPreviewSlide] = useState(0);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState("");
  async function loadPreviews() {
    if (!file) return;
    setPreviewBusy(true); setPreviewError("");
    const body = new FormData(); body.append("pptx_file", file);
    try {
      const response = await fetch(getApiUrl("/api/v1/ppt/template/fonts-upload-and-slides-preview"), { method: "POST", body, credentials: "include" });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, "Could not render slide previews"));
      const data = await response.json();
      setPreviews((data.slide_image_urls ?? []).map(resolveBackendAssetUrl)); setPreviewSlide(0);
    } catch (e) { setPreviewError(e instanceof Error ? e.message : "Preview failed"); }
    finally { setPreviewBusy(false); }
  }
  async function analyze(fix: boolean) {
    if (!file) return;
    setBusy(true); setError("");
    const body = new FormData(); body.append("file", file); body.append("fix", String(fix));
    if (brand) body.append("approved_template", brand);
    try {
      const response = await fetch(getApiUrl("/api/v1/quality/analyze"), { method: "POST", body, credentials: "include" });
      if (!response.ok) throw new Error(await getApiErrorMessage(response, "Analysis failed"));
      setReport(await response.json()); setCategory("all"); setSlide("all");
    } catch (e) { setError(e instanceof Error ? e.message : "Analysis failed"); }
    finally { setBusy(false); }
  }
  const issues = report?.issues.filter(i => (category === "all" || i.category === category) && (slide === "all" || i.slide === Number(slide))) ?? [];
  function downloadReport() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "powerpoint-quality-report.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <StudioPage eyebrow="05 / Review & improve" title="PowerPoint quality analysis" description="Check slide boundaries, text fit, overlapping text boxes, fonts, and brand colors. Add an approved template to compare explicit text styles and enable font and color corrections.">
    <section className={panelClass} aria-label="Upload PowerPoint for analysis"><div className="grid gap-5 lg:grid-cols-2"><label className="space-y-2 text-sm font-medium"><span className="flex items-center gap-2"><FileCheck2 className="h-4 w-4"/>Presentation to check</span><input className={fieldClass} type="file" accept=".pptx" disabled={busy || previewBusy} onChange={e => { setFile(e.target.files?.[0] ?? null); setReport(null); setError(""); setPreviews([]); setPreviewError(""); }}/><span className="block text-xs font-normal text-slate-500">PPTX · maximum 40 MB</span></label><label className="space-y-2 text-sm font-medium"><span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4"/>Approved brand template (optional)</span><input className={fieldClass} type="file" accept=".pptx" disabled={busy} onChange={e => { setBrand(e.target.files?.[0] ?? null); setReport(null); }}/><span className="block text-xs font-normal text-slate-500">Fonts and colors are read from the template and its theme.</span></label></div>
      <div className="mt-5 flex flex-wrap gap-3"><button className={primaryClass} disabled={!file || busy} onClick={() => analyze(false)}>{busy ? <Loader2 className="h-4 w-4 animate-spin"/> : <ShieldCheck className="h-4 w-4"/>}Analyze PowerPoint</button><button className={secondaryClass} disabled={!file || busy} onClick={() => analyze(true)}><Wrench className="h-4 w-4"/>Apply safe corrections</button></div><p className="mt-3 text-xs leading-5 text-slate-500">Corrections create a separate PPTX: move unrotated objects inside slide boundaries and, with a brand template, replace unapproved explicit text fonts and colors. Review the copy before using it.</p>
    </section>
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {report && <div className="mt-6 space-y-5"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[["Slides checked", report.slide_count], ["Issues detected", report.issue_count], ["Corrected", report.fixed_count], ["Need review", report.remaining_count]].map(([label, value]) => <div key={label} className={panelClass}><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></div>)}</div>
      <section className={panelClass}><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{report.filename}</h2><div className="flex flex-wrap gap-2"><button className={secondaryClass} onClick={downloadReport}><Download className="h-4 w-4"/>JSON report</button>{report.corrected_url && <a className={primaryClass} href={resolveBackendAssetUrl(report.corrected_url)} download><Download className="h-4 w-4"/>Corrected PPTX</a>}</div></div>
        {previews.length ? <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="mb-3 text-xs text-slate-500">Converted preview of uploaded file · Slide {previewSlide + 1} of {report.slide_count}</p><div className="flex flex-col gap-4 lg:flex-row"><div className="flex gap-2 overflow-auto lg:max-h-[360px] lg:w-28 lg:shrink-0 lg:flex-col">{previews.map((url, index) => <button key={url} onClick={() => { setPreviewSlide(index); setSlide(String(index + 1)); }} aria-label={`Preview slide ${index + 1}`} aria-pressed={previewSlide === index} className={`w-24 shrink-0 rounded-lg border-2 bg-white p-1 ${index === previewSlide ? "border-violet-500" : "border-transparent"}`}><img src={url} alt={`Slide ${index + 1} thumbnail`} className="w-full"/><span className="text-[10px]">{index + 1}</span></button>)}</div><img src={previews[previewSlide]} alt={`Converted preview of slide ${previewSlide + 1}`} className="max-h-[360px] min-w-0 flex-1 rounded-lg bg-white object-contain"/></div></div> : <div className="mb-5"><button className={secondaryClass} disabled={previewBusy || busy} onClick={loadPreviews}>{previewBusy && <Loader2 className="h-4 w-4 animate-spin"/>}{previewBusy ? "Rendering slide previews…" : "Load slide previews"}</button><p className="mt-2 text-xs text-slate-400">Optional: render the uploaded slides for visual review. This can take a minute.</p></div>}{previewError && <p role="alert" className="mb-4 text-sm text-red-700">{previewError}</p>}
        <div className="mb-5 flex flex-wrap gap-2" aria-label="Issue filters">{["all", "text", "alignment", "fonts", "colors"].map(c => <button key={c} aria-pressed={category === c} onClick={() => setCategory(c)} className={`rounded-full px-4 py-2 text-xs capitalize ${category === c ? "bg-violet-100 text-violet-800" : "bg-slate-50 text-slate-600"}`}>{c} ({c === "all" ? report.issue_count : report.categories[c] ?? 0})</button>)}<select aria-label="Filter by slide" className="rounded-full border px-3 text-xs" value={slide} onChange={e => setSlide(e.target.value)}><option value="all">All slides</option>{Array.from({ length: report.slide_count }, (_, i) => <option key={i} value={i + 1}>Slide {i + 1}</option>)}</select></div>
        <div className="divide-y">{issues.map(i => <div key={i.id} className="flex items-start gap-3 py-4"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${i.fixed ? "bg-emerald-500" : "bg-amber-500"}`}/><div className="min-w-0 flex-1"><p className="text-sm font-medium">{i.message}</p><p className="mt-1 text-xs text-slate-500">Slide {i.slide} · {i.shape} · {i.category}</p><p className="mt-2 text-sm text-slate-600">{i.suggestion}</p></div><span className="text-xs text-slate-500">{i.fixed ? "Corrected" : i.fixable ? "Can correct" : "Review"}</span></div>)}{!issues.length && <p className="py-12 text-center text-sm text-slate-500">{report.issue_count ? "No issues match these filters." : "No issues detected by the available structural checks."}</p>}</div>
      </section><p className="text-xs leading-5 text-slate-500">{report.limitations}</p>
    </div>}
  </StudioPage>;
}
