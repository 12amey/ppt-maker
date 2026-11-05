"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Clock, CheckCircle2, ClipboardList, AlertTriangle, Trash2 } from "lucide-react";
import { StudioPage, fieldClass, panelClass, primaryClass } from "./StudioPage";

type Status = "In progress" | "In review" | "Completed";
type Request = { id: string; title: string; team: string; owner: string; due: string; status: Status };
const key = "creative-hub-demo-requests-v1";
const initial: Request[] = [
  { id: "demo-1", title: "Q4 earnings presentation", team: "Wealth Management", owner: "A. Mehta", due: "2026-10-22", status: "In progress" },
  { id: "demo-2", title: "Client proposal deck", team: "Private Client Group", owner: "S. Rao", due: "2026-10-24", status: "In review" },
  { id: "demo-3", title: "Internal strategy update", team: "Corporate", owner: "M. Shah", due: "2026-10-20", status: "Completed" },
  { id: "demo-4", title: "Quarterly research report", team: "Investment Banking", owner: "R. Singh", due: "2026-10-27", status: "In progress" },
];
const statuses: Status[] = ["In progress", "In review", "Completed"];
const statusStyle = { "In progress": "bg-blue-50 text-blue-700", "In review": "bg-amber-50 text-amber-700", "Completed": "bg-emerald-50 text-emerald-700" };

export default function DesignOpsDashboard() {
  const [requests, setRequests] = useState<Request[]>(initial);
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    try { const saved = localStorage.getItem(key); if (saved) { const data: unknown = JSON.parse(saved); if (Array.isArray(data) && data.every(r => r && typeof r.id === "string" && typeof r.title === "string" && typeof r.team === "string" && typeof r.owner === "string" && typeof r.due === "string" && statuses.includes(r.status))) setRequests(data); } }
    catch { setStorageError("Browser storage is unavailable. Changes will last until this page is closed."); }
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) { try { localStorage.setItem(key, JSON.stringify(requests)); } catch { setStorageError("Browser storage is full or unavailable. Changes are temporary."); } } }, [requests, loaded]);
  const filtered = requests.filter(r => (filter === "all" || r.status === filter) && `${r.title} ${r.team} ${r.owner}`.toLowerCase().includes(search.toLowerCase()));
  const teams = [...new Set(requests.map(r => r.team))];
  const counts = statuses.map(s => requests.filter(r => r.status === s).length);
  function add(form: FormData) {
    setRequests(current => [...current, { id: crypto.randomUUID(), title: String(form.get("title")).trim(), team: String(form.get("team")).trim(), owner: String(form.get("owner")).trim(), due: String(form.get("due")), status: "In progress" }]);
    setAdding(false);
  }
  return <StudioPage eyebrow="02 / Design operations" title="A clear view of creative work" description="Track requests, deadlines, and ownership in one place. This demo stores your changes in this browser; sample quality insights below are illustrative.">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700">Demo workspace · local browser data</span><button className={primaryClass} onClick={() => setAdding(!adding)}><Plus className="h-4 w-4"/>{adding ? "Close form" : "New request"}</button></div>
    {storageError && <p role="status" className="mb-4 text-sm text-amber-700">{storageError}</p>}
    {adding && <form action={add} className={`${panelClass} mb-6 grid gap-4 md:grid-cols-2`}><label className="text-sm">Request title<input name="title" required maxLength={150} className={fieldClass}/></label><label className="text-sm">Team<input name="team" required maxLength={80} className={fieldClass}/></label><label className="text-sm">Owner<input name="owner" required maxLength={80} className={fieldClass}/></label><label className="text-sm">Due date<input name="due" type="date" required className={fieldClass}/></label><button className={primaryClass} type="submit">Save request</button></form>}
    <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">{[{ label: "Total requests", value: requests.length, Icon: ClipboardList, color: "text-violet-600" }, { label: "In progress", value: counts[0], Icon: Clock, color: "text-blue-600" }, { label: "In review", value: counts[1], Icon: AlertTriangle, color: "text-amber-600" }, { label: "Completed", value: counts[2], Icon: CheckCircle2, color: "text-emerald-600" }].map(({ label, value, Icon, color }) => <div key={label} className={panelClass}><Icon className={`mb-4 h-5 w-5 ${color}`}/><p className="text-3xl font-semibold">{value}</p><p className="mt-1 text-xs text-slate-500">{label}</p></div>)}</div>
    <section className={panelClass}><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Recent requests</h2><div className="flex flex-wrap gap-2"><input aria-label="Search requests" placeholder="Search requests…" className={fieldClass} value={search} onChange={e => setSearch(e.target.value)}/><select aria-label="Filter requests by status" className={fieldClass} value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All statuses</option>{statuses.map(s => <option key={s}>{s}</option>)}</select></div></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b bg-slate-50 text-xs text-slate-500"><tr>{["Request", "Client / team", "Owner", "Due date", "Status", ""].map((h, i) => <th key={i} className="p-3 font-medium">{h}</th>)}</tr></thead><tbody className="divide-y">{filtered.map(r => <tr key={r.id}><td className="p-3 font-medium">{r.title}</td><td className="p-3 text-slate-500">{r.team}</td><td className="p-3 text-slate-500">{r.owner}</td><td className="whitespace-nowrap p-3 text-slate-500">{r.due}</td><td className="p-3"><select aria-label={`Status for ${r.title}`} value={r.status} onChange={e => setRequests(current => current.map(row => row.id === r.id ? { ...row, status: e.target.value as Status } : row))} className={`rounded-lg p-2 text-xs ${statusStyle[r.status]}`}>{statuses.map(s => <option key={s}>{s}</option>)}</select></td><td><button className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Delete ${r.title}`} onClick={() => setRequests(current => current.filter(row => row.id !== r.id))}><Trash2 className="h-4 w-4"/></button></td></tr>)}</tbody></table>{!filtered.length && <p className="py-12 text-center text-sm text-slate-500">No requests match these filters.</p>}</div></section>
    <div className="mt-6 grid gap-5 lg:grid-cols-2"><section className={panelClass}><h2 className="font-semibold">Common formatting issues</h2><p className="mt-1 text-xs text-slate-400">Sample data · run Quality Analysis for your own deck</p><div className="mt-6 flex flex-wrap items-center gap-8"><div className="flex h-32 w-32 items-center justify-center rounded-full" style={{ background: "conic-gradient(#7c3aed 0% 42%, #38bdf8 42% 70%, #2dd4bf 70% 88%, #cbd5e1 88% 100%)" }}><div className="flex h-24 w-24 flex-col items-center justify-center rounded-full bg-white"><strong className="text-2xl">42%</strong><span className="text-[10px] text-slate-500">Text overflow</span></div></div><div className="flex-1 space-y-3">{[["Text overflow", 42, "#7c3aed"], ["Inconsistent fonts", 28, "#38bdf8"], ["Misaligned elements", 18, "#2dd4bf"], ["Incorrect color usage", 12, "#cbd5e1"]].map(([label, value, color]) => <div key={label} className="flex items-center gap-2 text-xs"><span className="h-2 w-2 rounded-full" style={{ background: String(color) }}/><span className="flex-1 text-slate-500">{label}</span><strong>{value}%</strong></div>)}</div></div><Link href="/quality-analysis" className="mt-6 block text-sm font-medium text-violet-700">Analyze a PowerPoint →</Link></section><section className={panelClass}><h2 className="font-semibold">Requests by team</h2><p className="mt-1 text-xs text-slate-400">Updates as you change the demo requests</p><div className="mt-6 space-y-4">{teams.map(team => { const count = requests.filter(r => r.team === team).length; return <div key={team}><div className="mb-1 flex justify-between text-xs"><span className="text-slate-600">{team}</span><strong>{count}</strong></div><div className="h-3 rounded-full bg-slate-100"><div className="h-3 rounded-full bg-violet-500" style={{ width: `${count / Math.max(1, requests.length) * 100}%` }}/></div></div>; })}{!teams.length && <p className="text-sm text-slate-500">Create a request to see team workload.</p>}</div></section></div>
  </StudioPage>;
}
