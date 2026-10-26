"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthShell } from "@/components/AuthShell";
import { post } from "@/lib/api";

export default function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password.length < 10) return setError("Use at least 10 characters for your password.");
    if (password !== confirmPassword) return setError("The passwords do not match.");
    setIsSubmitting(true);
    try {
      await post("/auth/reset-password", { token, password });
      router.replace("/login?passwordReset=1");
    } catch (e) {
      setError(e instanceof Error ? e.message : "This reset link could not be used");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell title="Choose a new password" subtitle="Your new password must be at least 10 characters.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <label className="label" htmlFor="password">New password</label>
          <div className="relative">
            <input id="password" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={10} className="field pr-16" value={password} onChange={(event) => setPassword(event.target.value)} />
            <button type="button" className="absolute inset-y-0 right-3 text-sm font-semibold text-mist hover:text-white" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>{showPassword ? "Hide" : "Show"}</button>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="confirmPassword">Confirm new password</label>
          <input id="confirmPassword" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={10} className="field" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
        </div>
        {error && <p role="alert" className="rounded-md bg-bad/10 p-3 text-sm text-bad">{error}</p>}
        <button className="btn btn-primary w-full" disabled={isSubmitting}>{isSubmitting ? "Saving password" : "Save new password"}</button>
      </form>
      <p className="mt-5 text-center text-sm text-mist"><Link href="/login" className="font-semibold text-ember hover:underline">Back to sign in</Link></p>
    </AuthShell>
  );
}
