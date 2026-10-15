export type OfflineUpload = {
  id: string;
  jobId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  lastModified: number;
  createdAt: string;
  blob: Blob;
};

const DB_NAME = "roofdesk-offline-uploads";
const STORE = "uploads";
export const MAX_OFFLINE_QUEUE_BYTES = 100 * 1024 * 1024;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open this browser's offline photo storage"));
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = run(tx.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Offline photo storage failed"));
      tx.onabort = () => reject(tx.error ?? new Error("Offline photo storage transaction was interrupted"));
    });
  } finally {
    db.close();
  }
}

export async function listOfflineUploads(jobId?: string): Promise<OfflineUpload[]> {
  const all = await withStore("readonly", (store) => store.getAll());
  return (jobId ? all.filter((item) => item.jobId === jobId) : all).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function saveOfflineUpload(jobId: string, file: File): Promise<OfflineUpload> {
  const existing = await listOfflineUploads();
  if (existing.reduce((sum, item) => sum + item.fileSize, 0) + file.size > MAX_OFFLINE_QUEUE_BYTES) {
    throw new Error("Offline photo storage is full (100 MB). Sync or remove queued files before adding more.");
  }
  const item: OfflineUpload = {
    id: crypto.randomUUID(), jobId, fileName: file.name, fileType: file.type,
    fileSize: file.size, lastModified: file.lastModified, createdAt: new Date().toISOString(), blob: file,
  };
  await withStore("readwrite", (store) => store.add(item));
  return item;
}

export async function removeOfflineUpload(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}
