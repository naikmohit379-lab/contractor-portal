"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, post } from "@/lib/api";

type Team = {
  users: { id: string; name: string; email: string; role: "operations" | "pm"; status: string; lastLoginAt?: string }[];
  invitations: { name: string; email: string; role: "operations" | "pm"; expiresAt: string }[];
};

export default function OperationsTeamPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"operations" | "pm">("operations");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["team", "members"], queryFn: () => api<Team>("/team/members") });
  const invite = useMutation({
    mutationFn: () => post<{ invitation: { email: string; role: "operations" | "pm" }; inviteUrl: string; emailed: boolean }>("/team/invitations", { name, email, role }),
    onSuccess: (result) => {
      setName(""); setEmail(""); setInviteUrl(result.inviteUrl);
      const title = result.invitation.role === "pm" ? "Project Manager" : "Operations Intern";
      setNotice(result.emailed ? `${title} invitation sent to ${result.invitation.email}. The link expires in 48 hours.` : `Email is not configured. Share the one-time ${title} invitation link securely with ${result.invitation.email}.`);
      setError(null); qc.invalidateQueries({ queryKey: ["team", "members"] });
    },
    onError: (e) => { setError((e as Error).message); setNotice(null); },
  });

  return <div className="space-y-6">
    <header><p className="text-xs font-bold uppercase tracking-[0.18em] text-ember">Workspace access</p><h1 className="text-4xl font-bold">Team access</h1><p className="mt-1 text-mist">Invite a Project Manager or Operations Intern. Each person sets their own password from a single-use link.</p></header>
    <section className="panel space-y-4 p-5">
      <div><h2 className="text-xl font-bold">Invite a teammate</h2><p className="text-sm text-mist">A single-use setup link expires after 48 hours. The invitee creates their own password.</p></div>
      <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end" onSubmit={(event) => { event.preventDefault(); invite.mutate(); }}>
        <div><label className="label" htmlFor="intern-name">Name</label><input id="intern-name" className="field" required minLength={2} maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="label" htmlFor="intern-email">Work email</label><input id="intern-email" type="email" className="field" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><label className="label" htmlFor="team-role">Role</label><select id="team-role" className="field" value={role} onChange={(e) => setRole(e.target.value as "operations" | "pm")}><option value="operations">Operations Intern</option><option value="pm">Project Manager</option></select></div>
        <button className="btn btn-primary" disabled={invite.isPending}>{invite.isPending ? "Sending…" : "Send invitation"}</button>
      </form>
      {notice && <p role="status" className="rounded-md bg-ok/10 p-3 text-sm text-ok">{notice}</p>}
      {inviteUrl && <div className="flex flex-col gap-2 rounded-md border border-ink-600 p-3 sm:flex-row sm:items-center"><input aria-label="One-time invitation link" className="field min-w-0 flex-1" readOnly value={inviteUrl} /><button type="button" className="btn btn-ghost" onClick={async () => { await navigator.clipboard.writeText(inviteUrl); setNotice("Invitation link copied. Share it only with the intended teammate."); }}>Copy link</button></div>}
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
    </section>
    <section className="panel overflow-hidden">
      <h2 className="border-b border-ink-600 px-5 py-3 text-xl font-bold">Team access</h2>
      {q.isLoading ? <p className="p-5 text-mist">Loading team…</p> : q.isError || !q.data ? <p role="alert" className="p-5 text-bad">Team members could not be loaded.</p> : <>
        <ul className="divide-y divide-ink-600">{q.data.users.map((user) => <li key={user.id} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><span><strong>{user.name}</strong><span className="block text-sm text-mist">{user.email} · {user.role === "pm" ? "Project Manager" : "Operations Intern"}</span></span><span className="text-sm capitalize text-mist-strong">{user.status}{user.lastLoginAt ? ` · Last sign-in ${new Date(user.lastLoginAt).toLocaleDateString()}` : " · Never signed in"}</span></li>)}</ul>
        {q.data.invitations.length > 0 && <div className="border-t border-ink-600 p-5"><h3 className="mb-2 font-semibold">Pending invitations</h3><ul className="space-y-2">{q.data.invitations.map((item) => <li key={item.email} className="text-sm"><strong>{item.name}</strong> · {item.email} · {item.role === "pm" ? "Project Manager" : "Operations Intern"} <span className="text-mist">· expires {new Date(item.expiresAt).toLocaleString()}</span></li>)}</ul></div>}
        {q.data.users.length === 0 && q.data.invitations.length === 0 && <p className="p-5 text-sm text-mist">No Operations Intern accounts yet.</p>}
      </>}
    </section>
    <p className="text-xs text-mist">Project Managers can manage jobs and operational follow-ups. Operations Interns can only view assigned jobs and manage their internal tasks. Invitations do not grant Admin privileges; the API enforces each role's permissions.</p>
  </div>;
}
