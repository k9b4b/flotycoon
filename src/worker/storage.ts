/**
 * Minimalny zapis w IndexedDB (bez zależności). Gdy przeglądarka blokuje
 * IndexedDB (tryb prywatny, podgląd), gra działa dalej, tylko bez zapisu.
 */
const DB = 'flotycoon';
const STORE = 'saves';

export interface SaveRecord {
  id: string;
  savedAt: number;
  state: unknown;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  }).finally(() => db.close());
}

export async function loadSave(slot: string): Promise<SaveRecord | undefined> {
  try {
    return await tx<SaveRecord | undefined>('readonly', (s) => s.get(slot));
  } catch {
    return undefined;
  }
}

export async function writeSave(rec: SaveRecord): Promise<boolean> {
  try {
    await tx('readwrite', (s) => s.put(rec));
    return true;
  } catch {
    return false;
  }
}
