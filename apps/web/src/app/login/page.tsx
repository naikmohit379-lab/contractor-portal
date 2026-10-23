"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { loginSchema, type LoginInput } from "@roofdesk/shared";
import { AuthShell } from "@/components/AuthShell";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const { login, status } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  useEffect(() => {
    if (status === "authed") router.replace("/dashboard");
  }, [status, router]);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await login(values);
      router.replace("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in");
    }
  });

  return (
    <AuthShell title="Sign in" subtitle="Pick up where your crew left off.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" inputMode="email" className="field" {...register("email")} />
          {errors.email && <p className="field-error">{errors.email.message}</p>}
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="label mb-0" htmlFor="password">Password</label>
            <span className="text-xs text-mist">Forgot password? Coming soon</span>
          </div>
          <div className="relative">
            <input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" className="field pr-16" {...register("password")} />
            <button
              type="button"
              className="absolute inset-y-0 right-3 text-sm font-semibold text-mist hover:text-white"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          {errors.password && <p className="field-error">{errors.password.message}</p>}
        </div>
        {error && <p role="alert" className="rounded-md bg-bad/10 p-3 text-sm text-bad">{error}</p>}
        <button className="btn btn-primary w-full" disabled={isSubmitting}>{isSubmitting ? "Signing in" : "Sign in"}</button>
      </form>
      <p className="mt-5 text-center text-sm text-mist">
        New to RoofDesk? <Link href="/register" className="font-semibold text-ember hover:underline">Create your company account</Link>
      </p>
    </AuthShell>
  );
}
