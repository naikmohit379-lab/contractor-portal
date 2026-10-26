"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AuthShell } from "@/components/AuthShell";
import { post } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);
    try {
      const result = await post<{ message: string }>("/auth/forgot-password", { email });
      setMessage(result.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit the request");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell title="Reset your password" subtitle="We’ll send a secure reset link if the email belongs to an active account.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" inputMode="email" required className="field" value={email} onChange={(event) => setEmail(event.target.value)} />
        </div>
        {message && <p role="status" className="rounded-md bg-ok/10 p-3 text-sm text-ok">{message}</p>}
        {error && <p role="alert" className="rounded-md bg-bad/10 p-3 text-sm text-bad">{error}</p>}
        <button className="btn btn-primary w-full" disabled={isSubmitting}>{isSubmitting ? "Sending request" : "Send reset link"}</button>
      </form>
      <p className="mt-5 text-center text-sm text-mist"><Link href="/login" className="font-semibold text-ember hover:underline">Back to sign in</Link></p>
    </AuthShell>
  );
}
