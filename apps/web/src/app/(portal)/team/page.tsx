"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, post } from "@/lib/api";

type Team = {
  users: { id: string; name: string; email: string; status: string; lastLoginAt?: string }[];
  invitations: { name: string; email: string; expiresAt: string }[];
};

export default function OperationsTeamPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["team", "operations"], queryFn: () => api<Team>("/team/operations") });
  const invite = useMutation({
    mutationFn: () => post<{ invitation: { email: string }; inviteUrl: string; emailed: boolean }>("/team/operations/invitations", { name, email }),
    onSuccess: (result) => {
      setName(""); setEmail(""); setInviteUrl(result.inviteUrl);
      setNotice(result.emailed ? `Invitation sent to ${result.invitation.email}. The link expires in 48 hours.` : `Email could not be delivered. Share the one-time link securely with ${result.invitation.email}.`);
      setError(null); qc.invalidateQueries({ queryKey: ["team", "operations"] });
    },
    onError: (e) => { setError((e as Error).message); setNotice(null); },
  });

  return <div className="space-y-6">
    <header><p className="text-xs font-bold uppercase tracking-[0.18em] text-ember">Workspace access</p><h1 className="text-4xl font-bold">Operations Interns</h1><p className="mt-1 text-mist">Invite interns to the limited operations workspace. They can see only jobs assigned to them.</p></header>
    <section className="panel space-y-4 p-5">
      <div><h2 className="text-xl font-bold">Invite an Operations Intern</h2><p className="text-sm text-mist">A single-use setup link expires after 48 hours. The invitee creates their own password.</p></div>
      <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={(event) => { event.preventDefault(); invite.mutate(); }}>
        <div><label className="label" htmlFor="intern-name">Name</label><input id="intern-name" className="field" required minLength={2} maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="label" htmlFor="intern-email">Work email</label><input id="intern-email" type="email" className="field" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <button className="btn btn-primary" disabled={invite.isPending}>{invite.isPending ? "Sending…" : "Send invitation"}</button>
      </form>
      {notice && <p role="status" className="rounded-md bg-ok/10 p-3 text-sm text-ok">{notice}</p>}
      {inviteUrl && <div className="flex flex-col gap-2 rounded-md border border-ink-600 p-3 sm:flex-row sm:items-center"><input aria-label="One-time invitation link" className="field min-w-0 flex-1" readOnly value={inviteUrl} /><button type="button" className="btn btn-ghost" onClick={async () => { await navigator.clipboard.writeText(inviteUrl); setNotice("Invitation link copied. Share it only with the intended intern."); }}>Copy link</button></div>}
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
    </section>
    <section className="panel overflow-hidden">
      <h2 className="border-b border-ink-600 px-5 py-3 text-xl font-bold">Team access</h2>
      {q.isLoading ? <p className="p-5 text-mist">Loading team…</p> : q.isError || !q.data ? <p role="alert" className="p-5 text-bad">Team members could not be loaded.</p> : <>
        <ul className="divide-y divide-ink-600">{q.data.users.map((user) => <li key={user.id} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><span><strong>{user.name}</strong><span className="block text-sm text-mist">{user.email}</span></span><span className="text-sm capitalize text-mist-strong">{user.status}{user.lastLoginAt ? ` · Last sign-in ${new Date(user.lastLoginAt).toLocaleDateString()}` : " · Never signed in"}</span></li>)}</ul>
        {q.data.invitations.length > 0 && <div className="border-t border-ink-600 p-5"><h3 className="mb-2 font-semibold">Pending invitations</h3><ul className="space-y-2">{q.data.invitations.map((item) => <li key={item.email} className="text-sm"><strong>{item.name}</strong> · {item.email} <span className="text-mist">· expires {new Date(item.expiresAt).toLocaleString()}</span></li>)}</ul></div>}
        {q.data.users.length === 0 && q.data.invitations.length === 0 && <p className="p-5 text-sm text-mist">No Operations Intern accounts yet.</p>}
      </>}
    </section>
    <p className="text-xs text-mist">Operations Intern accounts cannot manage users, company settings, estimates, claims, orders, waivers, or payments. Assign jobs from the job workspace; access is checked by the API.</p>
  </div>;
}
