"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, BriefcaseBusiness, FileSignature, FileWarning, Settings2, ShieldAlert, Truck, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { JobStage } from "@roofdesk/shared";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { useJobStageLabels } from "@/lib/jobStages";

type AdminOverview = {
  generatedAt: string;
  counts: { jobs: number; activeClaims: number; openWaivers: number; flaggedPayments: number; lateOrders: number; overdueTasks: number; activeUsers: number; missingDocuments: number };
  recentJobs: { id: string; jobNumber: string; customerName: string; address: string; stage: JobStage; updatedAt: string }[];
  activity: { id: string; actorName: string; action: string; entity: string; entityId: string; at: string }[];
};

function SummaryCard({ label, value, href, icon: Icon, alert = false }: { label: string; value: number; href: string; icon: LucideIcon; alert?: boolean }) {
  return <Link href={href} className="panel group flex min-h-28 items-start justify-between gap-4 p-4 transition hover:-translate-y-0.5 hover:border-ember">
    <div><p className="text-sm text-mist">{label}</p><p className={`mt-1 font-display text-3xl font-bold ${alert && value > 0 ? "text-bad" : ""}`}>{value}</p></div>
    <Icon size={20} aria-hidden className="mt-1 text-ember transition-transform group-hover:scale-110" />
  </Link>;
}

const readable = (value: string) => value.replace(/[._]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function AdminPage() {
  const { user, can } = useAuth();
  const stageLabels = useJobStageLabels();
  const overview = useQuery({ queryKey: ["admin", "overview"], queryFn: () => api<AdminOverview>("/admin/overview"), enabled: can("user:manage"), staleTime: 20_000 });

  if (!can("user:manage")) return <section className="panel mx-auto max-w-xl p-6"><h1 className="text-2xl font-bold">Admin access required</h1><p className="mt-2 text-mist">This company overview is available to owners and admins.</p><Link href="/dashboard" className="mt-4 inline-flex text-ember underline">Return to dashboard</Link></section>;

  if (overview.isLoading) return <p className="text-mist">Loading company overview…</p>;
  if (overview.isError || !overview.data) return <section role="alert" className="panel p-5 text-bad">The Admin Panel could not load. Refresh to try again.</section>;

  const { counts, recentJobs, activity } = overview.data;
  const cards = [
    { label: "Jobs on file", value: counts.jobs, href: "/jobs", icon: BriefcaseBusiness },
    { label: "Claims needing follow-up", value: counts.activeClaims, href: "/jobs", icon: FileWarning },
    { label: "Unsigned waivers", value: counts.openWaivers, href: "/waivers", icon: FileSignature, alert: true },
    { label: "Payment records flagged", value: counts.flaggedPayments, href: "/payments", icon: ShieldAlert, alert: true },
    { label: "Late supplier orders", value: counts.lateOrders, href: "/suppliers", icon: Truck, alert: true },
    { label: "Overdue follow-ups", value: counts.overdueTasks, href: "/dashboard", icon: AlertTriangle, alert: true },
    { label: "Jobs missing uploaded files", value: counts.missingDocuments, href: "/jobs", icon: FileWarning, alert: true },
    { label: "Active team accounts", value: counts.activeUsers, href: "/team", icon: Users },
  ];

  return <div className="space-y-8">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-ember">Company controls</p><h1 className="mt-1 text-4xl font-bold">Admin Panel</h1><p className="mt-2 text-mist">A company-wide view of work that needs attention, {user?.company.name}.</p></div>
      <p className="text-xs text-mist">Updated {fmtDate(overview.data.generatedAt)}</p>
    </header>

    <section aria-label="Administrative shortcuts" className="grid gap-3 sm:grid-cols-3">
      <Link className="panel flex min-h-20 items-center gap-3 p-4 hover:border-ember" href="/team"><Users aria-hidden className="text-ember"/><span><strong className="block">Team access</strong><span className="text-xs text-mist">Invite managers and interns</span></span></Link>
      <Link className="panel flex min-h-20 items-center gap-3 p-4 hover:border-ember" href="/settings"><Settings2 aria-hidden className="text-ember"/><span><strong className="block">Email preferences</strong><span className="text-xs text-mist">Choose your notification emails</span></span></Link>
      <Link className="panel flex min-h-20 items-center gap-3 p-4 hover:border-ember" href="/dashboard"><Activity aria-hidden className="text-ember"/><span><strong className="block">Operations workspace</strong><span className="text-xs text-mist">Review queues and assignments</span></span></Link>
    </section>

    <section aria-labelledby="admin-queues">
      <div className="mb-3"><h2 id="admin-queues" className="text-2xl font-bold">Company work queues</h2><p className="text-sm text-mist">Select a card to open the related workspace. Counts include your company only.</p></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{cards.map((card) => <SummaryCard key={card.label} {...card} />)}</div>
    </section>

    <div className="grid gap-5 lg:grid-cols-2">
      <section aria-labelledby="admin-recent-jobs" className="panel p-5">
        <div className="mb-3 flex items-center justify-between"><h2 id="admin-recent-jobs" className="text-xl font-bold">Recently updated jobs</h2><Link className="text-sm text-ember hover:underline" href="/jobs">All jobs</Link></div>
        {recentJobs.length ? <ul className="divide-y divide-ink-600">{recentJobs.map((job) => <li key={job.id}><Link href={`/jobs/${job.id}`} className="flex min-h-16 items-center justify-between gap-3 py-3 hover:text-ember"><span className="min-w-0"><strong className="block truncate">{job.jobNumber} · {job.customerName}</strong><span className="block truncate text-xs text-mist">{job.address} · {stageLabels[job.stage]}</span></span><span className="shrink-0 text-xs text-mist">{fmtDate(job.updatedAt)}</span></Link></li>)}</ul> : <p className="text-sm text-mist">No jobs have been created yet.</p>}
      </section>

      <section aria-labelledby="admin-activity" className="panel p-5">
        <div className="mb-3 flex items-center gap-2"><Activity size={18} aria-hidden className="text-ember"/><h2 id="admin-activity" className="text-xl font-bold">Recent activity</h2></div>
        {activity.length ? <ol className="space-y-3">{activity.map((event) => <li key={event.id} className="border-l-2 border-ink-600 pl-3"><p className="text-sm"><strong>{event.actorName}</strong> {readable(event.action)}</p><p className="text-xs text-mist">{event.entity} · {fmtDate(event.at)}</p></li>)}</ol> : <p className="text-sm text-mist">No activity has been recorded yet.</p>}
      </section>
    </div>

    <p className="text-xs text-mist">Payments remain in mock mode for this release. Texas waiver templates are not statutory forms until counsel supplies and approves their wording. Aerial measurement orders continue to use the configured provider; real EagleView reports require vendor credentials.</p>
  </div>;
}
