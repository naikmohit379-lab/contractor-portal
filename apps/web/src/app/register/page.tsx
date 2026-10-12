"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { registerSchema, type RegisterInput } from "@roofdesk/shared";
import { AuthShell } from "@/components/AuthShell";
import { useAuth } from "@/lib/auth";

const FIELDS: { name: keyof RegisterInput; label: string; type: string; autoComplete: string }[] = [
  { name: "companyName", label: "Company name", type: "text", autoComplete: "organization" },
  { name: "name", label: "Your name", type: "text", autoComplete: "name" },
  { name: "email", label: "Work email", type: "email", autoComplete: "email" },
  { name: "password", label: "Password (10+ characters)", type: "password", autoComplete: "new-password" },
];

export default function RegisterPage() {
  const { register: signUp } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await signUp(values);
      router.replace("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the account");
    }
  });

  return (
    <AuthShell title="Create your account" subtitle="You become the owner of your company workspace.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {FIELDS.map((f) => (
          <div key={f.name}>
            <label className="label" htmlFor={f.name}>{f.label}</label>
            <input id={f.name} type={f.type} autoComplete={f.autoComplete} className="field" {...register(f.name)} />
            {errors[f.name] && <p className="field-error">{errors[f.name]?.message}</p>}
          </div>
        ))}
        {error && <p role="alert" className="rounded-md bg-bad/10 p-3 text-sm text-bad">{error}</p>}
        <button className="btn btn-primary w-full" disabled={isSubmitting}>{isSubmitting ? "Creating account" : "Create account"}</button>
      </form>
      <p className="mt-5 text-center text-sm text-mist">
        Already have an account? <Link href="/login" className="font-semibold text-ember hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  );
}
