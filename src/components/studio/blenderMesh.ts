"use client";

/**
 * Real meshes from Blender: run a model's Blender script on the server, and keep the
 * resulting GLBs in this browser (IndexedDB, they're too big for localStorage) so meshes in
 * the workspace survive a reload.
 */

export type BlenderMesh = {
  /** Object URL of the GLB (valid for this page). */
  url: string;
  /** PNG render from Blender, as a data URL. */
  preview: string | null;
  tris: number;
  /** Width, depth, height in studs. */
  dims: [number, number, number];
};

let availability: Promise<boolean> | null = null;

/** Whether this server can run Blender (cached per page). */
export function blenderAvailable() {
  availability ??= fetch("/api/gen/blender")
    .then((r) => r.json())
    .then((d: { available?: boolean }) => !!d.available)
    .catch(() => false);
  return availability;
}

function toBytes(base64: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Runs a Blender script into a real mesh. `targetStuds` sets the longest side. */
export async function runBlender(script: string, targetStuds?: number, signal?: AbortSignal): Promise<BlenderMesh & { glb: Uint8Array }> {
  const res = await fetch("/api/gen/blender", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ script, ...(targetStuds ? { targetStuds } : {}) }),
    signal,
  });
  const data = (await res.json().catch(() => ({}))) as {
    glb?: string;
    preview?: string | null;
    report?: { tris?: number; dimensions?: number[] };
    error?: string;
  };
  if (!res.ok || !data.glb) throw new Error(data.error ?? `Blender failed (${res.status})`);
  const glb = toBytes(data.glb);
  const d = data.report?.dimensions ?? [0, 0, 0];
  return {
    glb,
    url: URL.createObjectURL(new Blob([glb], { type: "model/gltf-binary" })),
    preview: data.preview ?? null,
    tris: data.report?.tris ?? 0,
    dims: [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0],
  };
}

// ── Workspace meshes, persisted in IndexedDB ──

export type StoredMesh = { name: string; glb: Uint8Array; origin: [number, number, number]; dims: [number, number, number]; tris: number };
export type WorkspaceMesh = { name: string; url: string; origin: [number, number, number]; dims: [number, number, number]; tris: number };

const DB = "bloxy";
const STORE = "meshes";

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "name" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const req = run(d.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const meshStore = {
  put: (m: StoredMesh) => tx("readwrite", (s) => s.put(m)).catch(() => undefined),
  remove: (name: string) => tx("readwrite", (s) => s.delete(name)).catch(() => undefined),
  clear: () => tx("readwrite", (s) => s.clear()).catch(() => undefined),
  /** Every saved mesh, with a fresh object URL for each. */
  async all(): Promise<WorkspaceMesh[]> {
    const rows = (await tx<StoredMesh[]>("readonly", (s) => s.getAll() as IDBRequest<StoredMesh[]>).catch(() => [])) ?? [];
    return rows.map((r) => ({
      name: r.name,
      origin: r.origin,
      dims: r.dims,
      tris: r.tris,
      url: URL.createObjectURL(new Blob([r.glb as BlobPart], { type: "model/gltf-binary" })),
    }));
  },
};
