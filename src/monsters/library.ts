// Monster sheets are stored in this browser only (IndexedDB). They are never sent to the room.
// The creatures of the SRD 5.2.1 come with the extension: they are read from its files, in the panel's
// language, and never written to the browser's storage.
import { lang } from "../i18n";
import { HOMEBREW_RANGE } from "./homebrew";
import { type Profile, type ProfileSummary, summarize } from "./types";

export const SRD_SOURCE = "SRD 5.2.1";
/** Sheets that come with the extension. Their ids are the same in both languages. */
export const isBuiltIn = (id: string) => id.startsWith("srd:");

let srd: Promise<Profile[]> | null = null;
function builtIn(): Promise<Profile[]> {
  srd ??= (lang() === "en" ? import("./srd/en.json") : import("./srd/es.json")).then((module) => module.default as Profile[]);
  srd.catch(() => (srd = null));
  return srd;
}

const DB_NAME = "tirada";
const PROFILES = "profiles";
const SUMMARIES = "summaries";

let database: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(PROFILES, { keyPath: "id" });
      request.result.createObjectStore(SUMMARIES, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  database.catch(() => (database = null));
  return database;
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Every sheet: the ones stored in this browser and the ones that come with the extension. */
export async function listSummaries(): Promise<ProfileSummary[]> {
  const db = await open();
  const [mine, included] = await Promise.all([
    result<ProfileSummary[]>(db.transaction(SUMMARIES).objectStore(SUMMARIES).getAll()),
    builtIn().catch(() => [] as Profile[]),
  ]);
  const stored = new Set(mine.map((s) => s.id));
  const all = [...mine, ...included.filter((p) => !stored.has(p.id)).map(summarize)];
  return all.sort((a, b) => a.name.localeCompare(b.name) || a.source.localeCompare(b.source));
}

export async function getProfile(id: string): Promise<Profile | null> {
  const db = await open();
  const stored = await result<Profile | undefined>(db.transaction(PROFILES).objectStore(PROFILES).get(id));
  if (stored) return stored;
  if (!isBuiltIn(id)) return null;
  return (await builtIn()).find((p) => p.id === id) ?? null;
}

/** Adds sheets. A sheet with the same name and source replaces the old one. */
export async function saveProfiles(profiles: readonly Profile[]): Promise<void> {
  const db = await open();
  const transaction = db.transaction([PROFILES, SUMMARIES], "readwrite");
  for (const profile of profiles) {
    transaction.objectStore(PROFILES).put(profile);
    transaction.objectStore(SUMMARIES).put(summarize(profile));
  }
  await done(transaction);
}

export async function deleteProfile(id: string): Promise<void> {
  const db = await open();
  const transaction = db.transaction([PROFILES, SUMMARIES], "readwrite");
  transaction.objectStore(PROFILES).delete(id);
  transaction.objectStore(SUMMARIES).delete(id);
  await done(transaction);
}

/** Deletes the sheets stored in this browser. The included ones stay. */
export async function clearLibrary(): Promise<void> {
  const db = await open();
  const transaction = db.transaction([PROFILES, SUMMARIES], "readwrite");
  transaction.objectStore(PROFILES).clear();
  transaction.objectStore(SUMMARIES).clear();
  await done(transaction);
}

/** Full sheets created inside the extension, for the backup file. */
export async function listHomebrew(): Promise<Profile[]> {
  const db = await open();
  return result<Profile[]>(db.transaction(PROFILES).objectStore(PROFILES).getAll(IDBKeyRange.bound(...HOMEBREW_RANGE)));
}
