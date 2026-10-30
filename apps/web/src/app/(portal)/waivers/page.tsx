"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { TEMPLATE_PLACEHOLDERS, WAIVER_TYPE_LABELS, type TemplateDTO } from "@roofdesk/shared";
import { api, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate } from "@/lib/format";

function TemplateCard({ t }: { t: TemplateDTO }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState(t.body);
  const editable = can("user:manage");
  const refresh = () => qc.invalidateQueries({ queryKey: ["waiver-templates"] });
  const save = useMutation({ mutationFn: () => api<TemplateDTO>(`/waiver-templates/${t.type}`, { method: "PUT", body: JSON.stringify({ body }) }), onSuccess: refresh });
  const approve = useMutation({ mutationFn: () => post<TemplateDTO>(`/waiver-templates/${t.type}/approve`), onSuccess: refresh });
  const dirty = body !== t.body;

  return (
    <article className="panel space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">{WAIVER_TYPE_LABELS[t.type]}</h2>
        {t.legalApproved
          ? <span className="rounded bg-ok/15 px-2 py-1 text-xs font-semibold text-ok">Approved, version {t.version}{t.approvedAt && ` on ${fmtDate(t.approvedAt)}`}</span>
          : <span className="rounded bg-warn/15 px-2 py-1 text-xs font-semibold text-warn">Version {t.version}: needs counsel review</span>}
      </div>
      <label className="sr-only" htmlFor={`b-${t.type}`}>Form text</label>
      <textarea id={`b-${t.type}`} rows={11} className="field py-2 font-mono text-sm" value={body} readOnly={!editable} onChange={(e) => setBody(e.target.value)} />
      {editable && (
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn btn-ghost" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>Save as new version</button>
          {!t.legalApproved && <button className="btn btn-primary" disabled={dirty || approve.isPending} onClick={() => confirm("Confirm that your counsel has reviewed this form for the states you work in.") && approve.mutate()}>Approve for use</button>}
          {dirty && <span className="text-sm text-warn">Save before approving</span>}
          {(save.isError || approve.isError) && <span role="alert" className="text-sm text-bad">{((save.error || approve.error) as Error).message}</span>}
        </div>
      )}
    </article>
  );
}

export default function WaiverFormsPage() {
  const { user } = useAuth();
  const india = user?.company.settings?.country === "IN";
  const q = useQuery({ queryKey: ["waiver-templates"], queryFn: () => api<{ items: TemplateDTO[] }>("/waiver-templates"), enabled: !india });
  if (india) return <section className="panel max-w-2xl space-y-2 p-5"><h1 className="text-3xl font-bold">Waiver forms are unavailable</h1><p className="text-mist-strong">The India-first workspace does not provide U.S. statutory waiver forms. Use contract and payment documents reviewed for your business by Indian counsel.</p></section>;
  return (
    <div className="space-y-5">
      <h1 className="text-4xl font-bold">Waiver forms</h1>
      <div className="panel space-y-2 border-warn/40 p-4 text-sm">
        <p className="font-semibold text-warn">These are generic starter forms, not legal advice.</p>
        <p className="text-mist-strong">Several states require specific statutory wording. Have your counsel review and edit each form before approving it. Waivers cannot be requested from a form that is not approved, and editing a form creates a new version that needs approval again. Waivers already sent keep the exact wording they were sent with.</p>
        <p className="text-mist">Placeholders filled in automatically: {TEMPLATE_PLACEHOLDERS.map((p) => `{{${p}}}`).join("  ")}</p>
      </div>
      {q.isLoading && <p className="text-mist">Loading forms</p>}
      {q.data?.items.map((t) => <TemplateCard key={`${t.type}-${t.version}`} t={t} />)}
    </div>
  );
}
