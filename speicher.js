// Speicher auf dem Gerät (IndexedDB). Nichts verlässt das Handy.
// teile: ein Eintrag pro Kleidungsstück, Schlüssel = feste Nummer (1, 2, 3 …)
// meta:  "naechsteNr" = nächste freie Nummer. Wird nie zurückgezählt, auch nicht nach dem Löschen.
const DB_NAME = "outfit-helfer", DB_VERSION = 1;
let dbPromise = null;
function db() {
  if (!dbPromise) dbPromise = new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains("teile")) d.createObjectStore("teile", { keyPath: "nr" });
      if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta");
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  return dbPromise;
}
const done = tx => new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error("Speichern abgebrochen")); });

// Neues Teil speichern: Nummer vergeben und Teil in EINEM Schritt schreiben, damit keine Nummer doppelt vorkommt
export async function addItem(item) {
  const tx = (await db()).transaction(["teile", "meta"], "readwrite");
  const meta = tx.objectStore("meta");
  let nr;
  meta.get("naechsteNr").onsuccess = e => {
    nr = e.target.result || 1;
    meta.put(nr + 1, "naechsteNr");
    tx.objectStore("teile").add({ ...item, nr, erstellt: new Date().toISOString() });
  };
  await done(tx);
  return nr;
}
export async function allItems() {
  const req = (await db()).transaction("teile").objectStore("teile").getAll();
  return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
}
// Browser bitten, die Daten nicht beim Aufräumen zu löschen (Safari entscheidet selbst, ob er zustimmt)
export async function askPersist() {
  try { return navigator.storage?.persist ? await navigator.storage.persist() : false; } catch { return false; }
}
// Dreistellig mit führenden Nullen: 1 → "001"
export const nrText = nr => String(nr).padStart(3, "0");
