"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { post } from "@/lib/api";
import { AuthShell } from "@/components/AuthShell";

export default function AcceptOperationsInvitePage() {
  const { token } = useParams<{ token: string }>();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password.length < 10) return setError("Use at least 10 characters for your password.");
    if (password !== confirm) return setError("The passwords do not match.");
    setBusy(true);
    try {
      await post("/auth/accept-invite", { token, password });
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <AuthShell title={done ? "You’re all set" : "Join the operations team"} subtitle={done ? "Your account is ready. Sign in to open your operations workspace." : "Choose a password to accept your RoofDesk Operations Intern invitation."}>
    {done ? <Link href="/login" className="btn btn-primary w-full text-center">Continue to sign in</Link> : <form onSubmit={submit} className="space-y-4">
      <div><label className="label" htmlFor="new-password">Password (10+ characters)</label><input id="new-password" type="password" autoComplete="new-password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} maxLength={128} /></div>
      <div><label className="label" htmlFor="confirm-password">Confirm password</label><input id="confirm-password" type="password" autoComplete="new-password" className="field" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={10} maxLength={128} /></div>
      {error && <p role="alert" className="rounded-md bg-bad/10 p-3 text-sm text-bad">{error}</p>}
      <button className="btn btn-primary w-full" disabled={busy}>{busy ? "Setting up account…" : "Accept invitation"}</button>
    </form>}
  </AuthShell>;
}
