import Link from "next/link";

export const fieldClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-400";
export const primaryClass = "inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryClass = "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";
export const panelClass = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";

export function StudioPage({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: React.ReactNode }) {
  return <main className="mx-auto max-w-[1400px] p-5 text-slate-900 md:p-8 lg:p-10">
    <header className="mb-8"><div className="mb-3 flex items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-600">{eyebrow}</p><Link href="/ppt-maker" className="text-xs text-slate-500 hover:text-violet-700">Creative Hub</Link></div><h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">{description}</p></header>{children}
  </main>;
}
