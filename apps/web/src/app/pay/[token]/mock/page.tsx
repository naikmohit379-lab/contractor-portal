"use client";

import { useMutation } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { post } from "@/lib/api";

/** Stand-in for the gateway's hosted page in local development. It never asks for card details. */
export default function MockCheckoutPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const result = useMutation({
    mutationFn: (outcome: "success" | "failure") => post(`/public/payments/${token}/mock-result`, { outcome }),
    onSuccess: () => router.replace(`/pay/${token}?returned=1`),
  });
  return (
    <main className="mx-auto min-h-screen max-w-lg px-5 py-10">
      <div className="mb-8"><Logo href="/pay" /></div>
      <div className="panel space-y-4 p-6">
        <p className="rounded-md bg-warn/10 p-3 text-sm text-warn">Simulated checkout for local development. No card details are collected and no money moves.</p>
        <h1 className="text-3xl font-bold">Choose the result to simulate</h1>
        {result.isError && <p role="alert" className="text-sm text-bad">{(result.error as Error).message}</p>}
        <div className="flex flex-wrap gap-3">
          <button className="btn btn-primary" disabled={result.isPending} onClick={() => result.mutate("success")}>Simulate successful payment</button>
          <button className="btn btn-ghost" disabled={result.isPending} onClick={() => result.mutate("failure")}>Simulate declined card</button>
        </div>
      </div>
    </main>
  );
}
