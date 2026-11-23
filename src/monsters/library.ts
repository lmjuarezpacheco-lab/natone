// Monster sheets are stored in this browser only (IndexedDB). They are never sent to the room.
import { HOMEBREW_RANGE } from "./homebrew";
import { type Profile, type ProfileSummary, summarize } from "./types";

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

export async function listSummaries(): Promise<ProfileSummary[]> {
  const db = await open();
  const all = await result<ProfileSummary[]>(db.transaction(SUMMARIES).objectStore(SUMMARIES).getAll());
  return all.sort((a, b) => a.name.localeCompare(b.name) || a.source.localeCompare(b.source));
}

export async function getProfile(id: string): Promise<Profile | null> {
  const db = await open();
  return (await result<Profile | undefined>(db.transaction(PROFILES).objectStore(PROFILES).get(id))) ?? null;
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
