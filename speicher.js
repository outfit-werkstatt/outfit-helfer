// Speicher auf dem Gerät (IndexedDB). Nichts verlässt das Handy.
// teile: Angaben + kleine Vorschau, Schlüssel = feste Nummer (1, 2, 3 …). Bleibt klein, damit die Übersicht schnell lädt.
// fotos: das große Foto (ca. 1200 px) getrennt davon, wird nur bei Bedarf geladen (Bild-Paket, Sicherung).
// meta:  "naechsteNr" = nächste freie Nummer. Wird nie zurückgezählt, auch nicht nach dem Löschen.
//        "eigeneWerte" = selbst eingetippte Einträge, "ordner" = eigene Ordner [{ id, name }], "meinStil" = Vorlieben.
// Am Teil: ordner = [ids] (ein Teil kann in mehreren Ordnern sein, „Mein Kleiderschrank“ = alle Teile, kein Eintrag),
//          geloescht = Zeitpunkt, wenn es im Papierkorb liegt (sonst fehlt das Feld oder ist null).
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
// Ein Teil mit Vorschau (als Blob) oder null
export async function getItem(nr) {
  const t = await request((await db()).transaction("teile").objectStore("teile").get(nr));
  return t ? { ...t, vorschau: toBlob(t.vorschau) } : null;
}
// Angaben von Teilen ändern: [{ nr, ...geänderte Felder }], alles in EINEM Schritt. Vorschau und Nummer bleiben.
export async function updateItems(changes) {
  const tx = (await db()).transaction("teile", "readwrite"), teile = tx.objectStore("teile");
  for (const { nr, ...felder } of changes) {
    teile.get(nr).onsuccess = e => { if (e.target.result) teile.put({ ...e.target.result, ...felder }); };
  }
  await done(tx);
}
export const updateItem = (nr, felder) => updateItems([{ nr, ...felder }]);
// Papierkorb: Teil bleibt mit Nummer, Angaben und Ordnern gespeichert und kann zurückgeholt werden
export const trashItem = nr => updateItem(nr, { geloescht: new Date().toISOString() });
export const restoreItem = nr => updateItem(nr, { geloescht: null });
// Endgültig löschen (Papierkorb leeren oder nach 30 Tagen). Die Nummer wird trotzdem nie wieder vergeben.
export async function purgeItems(nrs) {
  if (!nrs.length) return;
  const tx = (await db()).transaction(["teile", "fotos"], "readwrite");
  for (const nr of nrs) { tx.objectStore("teile").delete(nr); tx.objectStore("fotos").delete(nr); }
  await done(tx);
}
// „Mein Stil“: was sie gern trägt (sehr persönlich, bleibt nur auf dem Gerät und in ihrer eigenen Sicherung)
export async function getStil() {
  return (await request((await db()).transaction("meta").objectStore("meta").get("meinStil"))) || {};
}
export async function setStil(stil) {
  const tx = (await db()).transaction("meta", "readwrite");
  tx.objectStore("meta").put(stil, "meinStil");
  await done(tx);
}
// Eigene Ordner [{ id, name }]
export async function getFolders() {
  return (await request((await db()).transaction("meta").objectStore("meta").get("ordner"))) || [];
}
export async function setFolders(folders) {
  const tx = (await db()).transaction("meta", "readwrite");
  tx.objectStore("meta").put(folders, "ordner");
  await done(tx);
}
// Ordner löschen: nur der Ordner verschwindet, die Teile bleiben (auch im Papierkorb wird er bei ihnen ausgetragen)
export async function deleteFolder(id) {
  const tx = (await db()).transaction(["teile", "meta"], "readwrite"), teile = tx.objectStore("teile"), meta = tx.objectStore("meta");
  teile.getAll().onsuccess = e => {
    for (const t of e.target.result) if (t.ordner?.includes(id)) teile.put({ ...t, ordner: t.ordner.filter(o => o !== id) });
  };
  meta.get("ordner").onsuccess = e => meta.put((e.target.result || []).filter(f => f.id !== id), "ordner");
  await done(tx);
}
// Welche Teile in einem Ordner liegen (Auswahl „Teile auswählen“): nrs = alle Nummern, die drin sein sollen
export async function setFolderItems(id, nrs) {
  const tx = (await db()).transaction("teile", "readwrite"), teile = tx.objectStore("teile");
  teile.getAll().onsuccess = e => {
    for (const t of e.target.result) {
      const drin = !!t.ordner?.includes(id), soll = nrs.has(t.nr);
      if (drin !== soll) teile.put({ ...t, ordner: soll ? [...(t.ordner || []), id] : t.ordner.filter(o => o !== id) });
    }
  };
  await done(tx);
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
