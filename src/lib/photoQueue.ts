// ============================================================================
// OFFLINE PHOTO QUEUE
//
// Cleaners work in lift lobbies, basements and high-rise stairwells where signal
// drops out. Uploading straight from the camera meant a failed upload stopped
// them dead and lost the shot — the fastest way to make them stop trusting the
// app.
//
// Now every photo is written to IndexedDB the instant it's taken (survives the
// app closing, the phone locking, or a reload), the cleaner carries on
// immediately, and a background flush drains the queue whenever there's signal.
//
// IndexedDB, not localStorage: localStorage is ~5 MB and strings only, so it
// cannot hold image blobs. IndexedDB stores Blobs natively with no real limit.
// ============================================================================

const DB_NAME = 'brightly-photo-queue';
const STORE = 'photos';
const DB_VERSION = 1;

export interface QueuedPhoto {
  id?: number;
  jobId: string;
  areaId: string;
  itemKey: string;
  /** Storage path the blob will be uploaded to. */
  path: string;
  /** Room name, used for the job_photos row the client report reads. */
  roomLabel: string;
  blob: Blob;
  createdAt: number;
  attempts: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('jobId', 'jobId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(db => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  }));
}

/** Save a photo for later upload. Returns immediately — never blocks the cleaner. */
export async function enqueuePhoto(p: Omit<QueuedPhoto, 'id' | 'createdAt' | 'attempts'>): Promise<number> {
  const rec: QueuedPhoto = { ...p, createdAt: Date.now(), attempts: 0 };
  return tx('readwrite', s => s.add(rec) as IDBRequest<number>) as Promise<number>;
}

/** Everything still waiting to upload for this job, oldest first. */
export async function pendingPhotos(jobId: string): Promise<QueuedPhoto[]> {
  const all = await tx<QueuedPhoto[]>('readonly', s => s.getAll() as IDBRequest<QueuedPhoto[]>);
  return (all || [])
    .filter(p => p.jobId === jobId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function countPending(jobId: string): Promise<number> {
  return (await pendingPhotos(jobId)).length;
}

export async function removePhoto(id: number): Promise<void> {
  await tx('readwrite', s => s.delete(id) as unknown as IDBRequest<undefined>);
}

export async function bumpAttempts(rec: QueuedPhoto): Promise<void> {
  await tx('readwrite', s => s.put({ ...rec, attempts: rec.attempts + 1 }) as unknown as IDBRequest<IDBValidKey>);
}

/** Clear a job's queue — used once the clean is submitted. */
export async function clearJob(jobId: string): Promise<void> {
  const items = await pendingPhotos(jobId);
  await Promise.all(items.map(i => (i.id != null ? removePhoto(i.id) : Promise.resolve())));
}
