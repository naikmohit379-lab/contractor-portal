"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, FileText, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DOC_SLOPES, MARKER_KINDS, MARKER_LABELS, MAX_UPLOAD_BYTES, type DocumentDTO, type Marker } from "@roofdesk/shared";
import { AuthImage } from "@/components/AuthImage";
import { api, downloadFile, uploadFile } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { listOfflineUploads, MAX_OFFLINE_QUEUE_BYTES, removeOfflineUpload, saveOfflineUpload, type OfflineUpload } from "@/lib/offline-uploads";

type UploadItem = OfflineUpload & { state: "queued" | "uploading"; message?: string };
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

function Detail({ jobId, doc, onClose }: { jobId: string; doc: DocumentDTO; onClose: () => void }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [caption, setCaption] = useState(doc.caption ?? "");
  const [slope, setSlope] = useState(doc.slope ?? "");
  const [include, setInclude] = useState(doc.includeInPacket);
  const [markers, setMarkers] = useState<Marker[]>(doc.annotations);
  const [kind, setKind] = useState<Marker["kind"]>("hail");
  const editable = can("job:write");
  const isImage = doc.contentType.startsWith("image/");

  const refresh = () => qc.invalidateQueries({ queryKey: ["jobs", jobId, "documents"] });
  const save = useMutation({
    mutationFn: () => api(`/jobs/${jobId}/documents/${doc.id}`, { method: "PATCH", body: JSON.stringify({ caption, slope: slope || undefined, includeInPacket: include, annotations: markers }) }),
    onSuccess: refresh,
  });
  const del = useMutation({ mutationFn: () => api(`/jobs/${jobId}/documents/${doc.id}`, { method: "DELETE" }), onSuccess: () => { refresh(); onClose(); } });

  return (
    <div className="panel space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="truncate text-xl font-bold">{doc.filename}</h3>
        <button className="btn btn-ghost h-10 min-h-0 px-3" onClick={onClose}>Close</button>
      </div>

      {isImage ? (
        <div>
          <AuthImage doc={doc} markers={markers} className="max-h-[70vh] w-full rounded-md object-contain" onClickAt={editable ? (x, y) => setMarkers((m) => m.length >= 50 ? m : [...m, { id: crypto.randomUUID().slice(0, 8), x, y, kind }]) : undefined} />
          {editable && <p className="mt-2 text-sm text-mist">Click the picture to mark damage. Choose the kind first.</p>}
        </div>
      ) : (
        <p className="flex items-center gap-2 text-mist-strong"><FileText aria-hidden /> PDF document. Use Download to open it.</p>
      )}

      {isImage && editable && (
        <fieldset className="flex flex-wrap gap-2">
          <legend className="label">Next marker is</legend>
          {MARKER_KINDS.map((k) => (
            <label key={k} className={`flex min-h-[44px] cursor-pointer items-center rounded-md border px-3 text-sm ${kind === k ? "border-ember bg-ember/15 text-ember-300" : "border-ink-500 text-mist-strong"}`}>
              <input type="radio" name="marker-kind" className="sr-only" checked={kind === k} onChange={() => setKind(k)} /> {MARKER_LABELS[k]}
            </label>
          ))}
        </fieldset>
      )}

      {markers.length > 0 && (
        <ol className="space-y-2">
          {markers.map((m, i) => (
            <li key={m.id} className="flex items-center gap-2 text-sm">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ember text-xs font-bold text-white">{i + 1}</span>
              <span className="w-28 shrink-0 text-mist-strong">{MARKER_LABELS[m.kind]}</span>
              <input aria-label={`Note for marker ${i + 1}`} className="field h-10 min-h-0 flex-1" placeholder="Note (optional)" disabled={!editable} value={m.note ?? ""} onChange={(e) => setMarkers((arr) => arr.map((x) => x.id === m.id ? { ...x, note: e.target.value } : x))} />
              {editable && <button className="btn btn-ghost h-10 min-h-0 px-2" aria-label={`Remove marker ${i + 1}`} onClick={() => setMarkers((arr) => arr.filter((x) => x.id !== m.id))}><Trash2 size={15} /></button>}
            </li>
          ))}
        </ol>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="cap">Caption</label><input id="cap" className="field" disabled={!editable} value={caption} onChange={(e) => setCaption(e.target.value)} /></div>
        <div><label className="label" htmlFor="slp">Roof slope or area</label>
          <select id="slp" className="field" disabled={!editable} value={slope} onChange={(e) => setSlope(e.target.value as typeof slope)}>
            <option value="">Not set</option>{DOC_SLOPES.map((s) => <option key={s} value={s}>{s[0]!.toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
      </div>
      {isImage && <label className="flex items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5 accent-ember" disabled={!editable} checked={include} onChange={(e) => setInclude(e.target.checked)} /> Include in the claim packet</label>}

      {(save.isError || del.isError) && <p role="alert" className="text-sm text-bad">{((save.error || del.error) as Error).message}</p>}
      <div className="flex flex-wrap gap-3">
        {editable && <button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving" : "Save details"}</button>}
        <button className="btn btn-ghost" onClick={() => downloadFile(`/jobs/${jobId}/documents/${doc.id}/file`, doc.filename)}>Download original</button>
        {editable && <button className="btn btn-ghost" disabled={del.isPending} onClick={() => confirm("Delete this file permanently?") && del.mutate()}>Delete</button>}
      </div>
      <p className="break-all text-xs text-mist">{mb(doc.sizeBytes)} | uploaded {fmtDate(doc.createdAt)} | SHA-256 {doc.sha256.slice(0, 16)}</p>
    </div>
  );
}

export function PhotosTab({ jobId }: { jobId: string }) {
  const { can, user } = useAuth();
  const qc = useQueryClient();
  const [queue, setQueue] = useState<UploadItem[]>([]);
  const [online, setOnline] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const syncing = useRef(false);
  const q = useQuery({ queryKey: ["jobs", jobId, "documents"], queryFn: () => api<{ items: DocumentDTO[] }>(`/jobs/${jobId}/documents`) });

  async function refreshQueue() {
    if (!user?.id) { setQueue([]); return; }
    const items = await listOfflineUploads(jobId, user.id);
    setQueue(items.map((item) => ({ ...item, state: "queued" })));
  }

  async function syncQueue() {
    if (syncing.current || !navigator.onLine || !user?.id) return;
    syncing.current = true;
    setOnline(true);
    try {
      for (const item of await listOfflineUploads(jobId, user.id)) {
        setQueue((items) => items.map((entry) => entry.id === item.id ? { ...entry, state: "uploading", message: undefined } : entry));
        try {
          const file = new File([item.blob], item.fileName, { type: item.fileType, lastModified: item.lastModified });
          await uploadFile(`/jobs/${jobId}/documents`, file);
          await removeOfflineUpload(item.id);
        } catch (error) {
          const message = !navigator.onLine || error instanceof TypeError ? "Waiting for a connection. This file is saved on this device." : (error as Error).message;
          setQueue((items) => items.map((entry) => entry.id === item.id ? { ...entry, state: "queued", message } : entry));
          if (!navigator.onLine || error instanceof TypeError) break;
        }
      }
      await refreshQueue();
      qc.invalidateQueries({ queryKey: ["jobs", jobId, "documents"] });
    } catch (error) {
      setQueue((items) => items.map((entry) => ({ ...entry, state: "queued", message: (error as Error).message })));
    } finally {
      syncing.current = false;
    }
  }

  useEffect(() => {
    const onlineNow = () => setOnline(true);
    const offlineNow = () => setOnline(false);
    setOnline(navigator.onLine);
    setQueue([]);
    void refreshQueue().catch(() => {});
    window.addEventListener("online", onlineNow);
    window.addEventListener("offline", offlineNow);
    return () => { window.removeEventListener("online", onlineNow); window.removeEventListener("offline", offlineNow); };
  }, [jobId, user?.id]);

  useEffect(() => {
    if (online && queue.length) void syncQueue();
  }, [online, queue.length, jobId]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files);
    for (const file of list) {
      if (file.size > MAX_UPLOAD_BYTES) { window.alert(`${file.name}: ${mb(file.size)} is over the ${mb(MAX_UPLOAD_BYTES)} limit.`); continue; }
      try {
        if (!user?.id) throw new Error("Sign in again before saving uploads.");
        const saved = await saveOfflineUpload(jobId, user.id, file);
        setQueue((items) => [...items, { ...saved, state: "queued" }]);
      } catch (error) {
        window.alert(`${file.name}: ${(error as Error).message}`);
      }
    }
    if (navigator.onLine) void syncQueue();
  }

  async function discardQueued(id: string) {
    await removeOfflineUpload(id);
    setQueue((items) => items.filter((item) => item.id !== id));
  }

  const open = q.data?.items.find((d) => d.id === openId);
  return (
    <section aria-label="Photos and documents" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">Photos and documents</h2>
        {can("job:write") && (
          <div className="flex flex-wrap gap-2">
            <input ref={camRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
            <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,application/pdf" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
            <button className="btn btn-primary" onClick={() => camRef.current?.click()}><Camera size={18} aria-hidden /> Take photo</button>
            <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}><Upload size={18} aria-hidden /> Upload files</button>
          </div>
        )}
      </div>

      {queue.length > 0 && <section className="panel p-4" aria-label="Offline photo upload queue">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div><h3 className="font-bold">Pending uploads ({queue.length})</h3><p className="text-xs text-mist">Saved in this browser on this device (up to {mb(MAX_OFFLINE_QUEUE_BYTES)}). Keep RoofDesk open or return while online to sync.</p></div>
          <button className="btn btn-ghost" disabled={!online || syncing.current} onClick={() => void syncQueue()}>{online ? "Sync now" : "Waiting for connection"}</button>
        </div>
        <ul className="divide-y divide-ink-600 text-sm" aria-live="polite">
          {queue.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 py-3">
            <span className="min-w-0"><span className="block truncate">{item.fileName}</span><span className="text-xs text-mist">{mb(item.fileSize)}</span></span>
            <span className="flex shrink-0 items-center gap-3"><span className="text-mist">{item.state === "uploading" ? "Uploading…" : item.message ?? (online ? "Queued" : "Saved offline")}</span><button className="text-xs text-mist underline" onClick={() => void discardQueued(item.id)}>Remove</button></span>
          </li>)}
        </ul>
      </section>}

      {open && <Detail key={open.id + open.createdAt + JSON.stringify(open.annotations)} jobId={jobId} doc={open} onClose={() => setOpenId(null)} />}

      {q.data?.items.length === 0 && <p className="panel p-6 text-mist">No photos yet. Take photos of the damage on each slope, then mark hail hits and wind damage so the adjuster sees what you saw.</p>}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {q.data?.items.map((d) => (
          <li key={d.id}>
            <button className={`block w-full overflow-hidden rounded-lg border text-left ${openId === d.id ? "border-ember" : "border-ink-600 hover:border-ink-500"}`} onClick={() => setOpenId(d.id)} aria-label={`Open ${d.caption || d.filename}`}>
              {d.contentType.startsWith("image/")
                ? <AuthImage doc={d} markers className="aspect-square w-full object-cover" />
                : <span className="grid aspect-square place-items-center bg-ink-700 text-mist"><FileText size={36} aria-hidden /></span>}
              <span className="block space-y-0.5 p-2 text-xs">
                <span className="block truncate font-medium">{d.caption || d.filename}</span>
                <span className="block text-mist">{d.slope ?? "No slope"}{d.annotations.length > 0 && ` | ${d.annotations.length} marked`}{d.kind === "photo" && !d.includeInPacket && " | not in packet"}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
