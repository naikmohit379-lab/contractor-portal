"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

type Connection = { enabled: boolean; configured: boolean; keyIdHint?: string; webhookUrl: string };

export function RazorpayTestSettings({ country }: { country: string }) {
  const qc = useQueryClient();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const q = useQuery({ queryKey: ["razorpay-test-connection"], queryFn: () => api<Connection>("/admin/razorpay-test"), enabled: country === "IN" });
  const save = useMutation({
    mutationFn: (credentials: { keyId: string; keySecret: string; webhookSecret: string }) => api<Connection>("/admin/razorpay-test", { method: "PUT", body: JSON.stringify(credentials) }),
    onSuccess: async () => { setNotice("Razorpay Test Mode credentials encrypted and saved."); setError(""); await qc.invalidateQueries({ queryKey: ["razorpay-test-connection"] }); },
    onError: (e) => { setError((e as Error).message); setNotice(""); },
  });
  const remove = useMutation({
    mutationFn: () => api("/admin/razorpay-test", { method: "DELETE" }),
    onSuccess: async () => { setNotice("Test Mode account disconnected."); await qc.invalidateQueries({ queryKey: ["razorpay-test-connection"] }); },
    onError: (e) => setError((e as Error).message),
  });
  if (country !== "IN") return null;

  return <section aria-labelledby="razorpay-test" className="panel space-y-4 p-5">
    <div>
      <h2 id="razorpay-test" className="text-2xl font-bold">Razorpay Test Mode</h2>
      <p className="text-sm text-mist">Connect this company’s own Razorpay Test account. Test payments do not move real money. Each company connects its own account; Roofora never receives or routes the funds.</p>
    </div>
    {q.data && !q.data.enabled && <p className="rounded-md bg-warn/10 p-3 text-sm text-warn">Test API connection is disabled by the server. No payment credentials can be submitted yet.</p>}
    {q.data?.enabled && <div className="space-y-1 rounded-md bg-ink-800 p-3 text-sm"><p className="font-medium">Test Mode webhook URL</p><p className="break-all text-xs text-mist">{q.data.webhookUrl}</p>{!q.data.webhookUrl.startsWith("https://") && <p className="text-xs text-warn">Ask the deployment owner to set PUBLIC_API_URL to the public HTTPS API origin before registering this webhook.</p>}<p className="text-xs text-mist">Register this URL in your Razorpay Test Mode dashboard with the four events below, then enter the generated webhook secret in this form.</p></div>}
    {q.data?.configured && <p className="text-sm text-ok">Connected in Test Mode ({q.data.keyIdHint}). The secret is hidden after saving.</p>}
    {q.data?.enabled && <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      const data = new FormData(e.currentTarget);
      save.mutate({ keyId: String(data.get("rzp-key-id") ?? "").trim(), keySecret: String(data.get("rzp-key-secret") ?? ""), webhookSecret: String(data.get("rzp-webhook-secret") ?? "") });
      e.currentTarget.reset();
    }}>
      <div><label className="label" htmlFor="rzp-key-id">Razorpay Test Key ID</label><input className="field" id="rzp-key-id" name="rzp-key-id" autoComplete="off" placeholder="rzp_test_…" required pattern="rzp_test_[A-Za-z0-9]+" /></div>
      <div><label className="label" htmlFor="rzp-key-secret">Razorpay Test Key Secret</label><input className="field" id="rzp-key-secret" name="rzp-key-secret" type="password" autoComplete="new-password" required /></div>
      <div><label className="label" htmlFor="rzp-webhook-secret">Razorpay Test Webhook Secret</label><input className="field" id="rzp-webhook-secret" name="rzp-webhook-secret" type="password" autoComplete="new-password" required /><p className="mt-1 text-xs text-mist">Set this same webhook secret in the Test Mode Razorpay dashboard. Subscribe to payment_link.paid, payment.failed, refund.processed, and payment.captured.</p></div>
      <div className="flex flex-wrap gap-2"><button className="btn btn-primary" disabled={save.isPending}>{save.isPending ? "Saving securely…" : "Save Test credentials"}</button>{q.data.configured && <button className="btn btn-ghost" type="button" disabled={remove.isPending} onClick={() => remove.mutate()}>Disconnect Test account</button>}</div>
    </form>}
    {notice && <p role="status" className="text-sm text-ok">{notice}</p>}
    {error && <p role="alert" className="text-sm text-bad">{error}</p>}
    {q.isError && <p role="alert" className="text-sm text-bad">{(q.error as Error).message}</p>}
  </section>;
}
