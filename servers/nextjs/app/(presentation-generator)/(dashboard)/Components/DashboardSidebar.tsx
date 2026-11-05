"use client";
import { Presentation, LayoutDashboard, ImageIcon, Video, ShieldCheck, Settings } from "lucide-react";
import { usePathname } from "next/navigation";
import Link from "next/link";

export const defaultNavItems = [
  { key: "ppt-maker", label: "PPT Maker", icon: Presentation },
  { key: "dashboard", label: "My presentations", icon: LayoutDashboard },
  { key: "image-generation", label: "Image generation", icon: ImageIcon },
  { key: "video-generation", label: "Video generation", icon: Video },
  { key: "quality-analysis", label: "Quality analysis", icon: ShieldCheck },
];
export const BelongingNavItems = [{ key: "settings", label: "Settings", icon: Settings }];

export default function DashboardSidebar() {
  const pathname = usePathname();
  return <aside className="sticky top-0 flex h-screen w-[82px] shrink-0 flex-col border-r border-slate-200 bg-[#f7f8fc] px-2 py-5 md:w-[190px] md:px-3" aria-label="Creative Hub navigation">
    <Link href="/ppt-maker" className="mb-8 flex items-center gap-2 px-2 font-semibold text-slate-900"><Presentation className="h-9 w-9 rounded-xl bg-violet-600 p-2 text-white"/><span className="hidden md:block">Creative Hub</span></Link>
    <nav className="space-y-2">{defaultNavItems.map(({ key, label, icon: Icon }) => {
      const active = pathname === `/${key}` || (key === "ppt-maker" && ["/templates", "/community"].includes(pathname));
      return <Link key={key} href={`/${key}`} prefetch={false} aria-current={active ? "page" : undefined} title={label} className={`flex flex-col items-center gap-2 rounded-xl px-2 py-3 text-center text-[10px] font-medium transition md:flex-row md:text-left md:text-sm ${active ? "bg-violet-100 text-violet-800" : "text-slate-600 hover:bg-slate-100"}`}><Icon className="h-5 w-5 shrink-0"/>{label}</Link>;
    })}</nav>
    <Link href="/settings" className="mt-auto flex items-center justify-center gap-2 rounded-xl p-3 text-sm text-slate-600 md:justify-start"><Settings className="h-5 w-5"/><span className="hidden md:block">Settings</span></Link>
  </aside>;
}
