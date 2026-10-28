// Speicher auf dem Gerät (IndexedDB). Nichts verlässt das Handy.
// teile: Angaben + kleine Vorschau, Schlüssel = feste Nummer (1, 2, 3 …). Bleibt klein, damit die Übersicht schnell lädt.
// fotos: das große Foto (ca. 1200 px) getrennt davon, wird nur bei Bedarf geladen (Bild-Paket, Sicherung).
// meta:  "naechsteNr" = nächste freie Nummer. Wird nie zurückgezählt, auch nicht nach dem Löschen.
// Bilder liegen als ArrayBuffer statt als Blob: ältere Safari-Versionen hatten Fehler mit Blobs in IndexedDB.
const DB_NAME = "outfit-helfer", DB_VERSION = 1;
let dbPromise = null;
function db() {
  if (!dbPromise) dbPromise = new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains("teile")) d.createObjectStore("teile", { keyPath: "nr" });
      if (!d.objectStoreNames.contains("fotos")) d.createObjectStore("fotos");
      if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta");
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  return dbPromise;
}
// Fehler einer einzelnen Anfrage stehen in e.target.error, tx.error ist in dem Moment oft noch leer
const done = tx => new Promise((res, rej) => {
  const fail = e => rej(e?.target?.error || tx.error || new Error("Speichern abgebrochen"));
  tx.oncomplete = () => res(); tx.onerror = fail; tx.onabort = fail;
});
const request = req => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
const toBlob = buf => new Blob([buf], { type: "image/jpeg" });

// Neues Teil speichern: Nummer vergeben, Angaben und Foto in EINEM Schritt schreiben.
// Klappt etwas nicht, wird nichts gespeichert und die Nummer nicht verbraucht.
export async function addItem({ foto, vorschau, ...angaben }) {
  // Erst umwandeln, dann schreiben: während einer Transaktion darf nicht auf anderes gewartet werden
  const [fotoBuf, vorschauBuf] = await Promise.all([foto.arrayBuffer(), vorschau.arrayBuffer()]);
  const tx = (await db()).transaction(["teile", "fotos", "meta"], "readwrite");
  const meta = tx.objectStore("meta");
  let nr;
  meta.get("naechsteNr").onsuccess = e => {
    nr = e.target.result || 1;
    meta.put(nr + 1, "naechsteNr");
    tx.objectStore("teile").add({ ...angaben, vorschau: vorschauBuf, nr, erstellt: new Date().toISOString() });
    tx.objectStore("fotos").add(fotoBuf, nr);
  };
  await done(tx);
  return nr;
}
// Alle Teile mit Vorschau (als Blob), ohne die großen Fotos
export async function allItems() {
  const items = await request((await db()).transaction("teile").objectStore("teile").getAll());
  return items.map(t => ({ ...t, vorschau: toBlob(t.vorschau) }));
}
// Großes Foto eines Teils (als Blob) oder null
export async function getPhoto(nr) {
  const buf = await request((await db()).transaction("fotos").objectStore("fotos").get(nr));
  return buf ? toBlob(buf) : null;
}
// Selbst eingetippte Einträge („Andere …“), pro Merkmal eine Liste: { Art: [{ wert, gruppe }], Farbe: [{ wert }], … }
// Liegen am selben Ort wie die Teile und kommen später mit in die Sicherung.
export async function getCustom() {
  return (await request((await db()).transaction("meta").objectStore("meta").get("eigeneWerte"))) || {};
}
export async function setCustom(custom) {
  const tx = (await db()).transaction("meta", "readwrite");
  tx.objectStore("meta").put(custom, "eigeneWerte");
  await done(tx);
}
// Browser bitten, die Daten nicht beim Aufräumen zu löschen (Safari entscheidet selbst, ob er zustimmt)
export async function askPersist() {
  try { return navigator.storage?.persist ? await navigator.storage.persist() : false; } catch { return false; }
}
// Dreistellig mit führenden Nullen: 1 → "001"
export const nrText = nr => String(nr).padStart(3, "0");
