// Speicher auf dem Gerät (IndexedDB). Nichts verlässt das Handy.
// teile: Angaben + kleine Vorschau, Schlüssel = feste Nummer (1, 2, 3 …). Bleibt klein, damit die Übersicht schnell lädt.
// fotos: das große Foto (ca. 1200 px) getrennt davon, wird nur bei Bedarf geladen (Bild-Paket, Sicherung).
// meta:  "naechsteNr" = nächste freie Nummer. Wird von selbst nie zurückgezählt, auch nicht nach dem Löschen
//        (nur auf ausdrücklichen Wunsch, wenn es gar keine Teile mehr gibt: nummernZuruecksetzen).
//        "eigeneWerte" = selbst eingetippte Einträge, "ordner" = eigene Ordner [{ id, name }], "meinStil" = Vorlieben.
// Am Teil: ordner = [ids] (ein Teil kann in mehreren Ordnern sein, „Mein Kleiderschrank“ = alle Teile, kein Eintrag),
//          geloescht = Zeitpunkt, wenn es im Papierkorb liegt (sonst fehlt das Feld oder ist null).
//        "outfits" = fertige Outfits [{ id, name, nrs, text, quelle: "chat"|"app", erstellt, geaendert, foto: true|false }].
//        Ein Foto vom fertigen Look liegt in „fotos“ unter "outfit:<id>" (groß) und "outfit-klein:<id>" (Vorschau). Die Schlüssel
//        sind Text, die der Teile Zahlen: So braucht es keinen neuen Speicherbereich und keinen Umbau der Datenbank.
// entwuerfe (ab DB_VERSION 2): ausgewählte Fotos, die noch nicht gespeichert sind (wartend oder erkannt), Schlüssel = id.
//        Damit nichts verloren geht, wenn das iPhone die App beim Hinzufügen vieler Fotos schließt. Kommt nicht in die Sicherung.
// Bilder liegen als ArrayBuffer statt als Blob: ältere Safari-Versionen hatten Fehler mit Blobs in IndexedDB.
// Umzug 1 → 2: nur der neue Bereich „entwuerfe“ kommt dazu, die anderen bleiben unverändert.
const DB_NAME = "outfit-helfer", DB_VERSION = 2;
let dbPromise = null;
function db() {
  if (!dbPromise) dbPromise = new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains("teile")) d.createObjectStore("teile", { keyPath: "nr" });
      if (!d.objectStoreNames.contains("fotos")) d.createObjectStore("fotos");
      if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta");
      if (!d.objectStoreNames.contains("entwuerfe")) d.createObjectStore("entwuerfe", { keyPath: "id" });
    };
    // Will eine neuere Version der App umziehen, gibt diese hier die Datenbank frei (sonst wartet die neue ewig)
    req.onsuccess = () => { req.result.onversionchange = () => req.result.close(); res(req.result); };
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

// Neues Teil speichern: Nummer vergeben, Angaben und Foto in EINEM Schritt schreiben, dabei den Entwurf (falls angegeben) löschen.
// Klappt etwas nicht, wird nichts gespeichert und die Nummer nicht verbraucht.
export async function addItem({ foto, vorschau, ...angaben }, entwurfId = null) {
  // Erst umwandeln, dann schreiben: während einer Transaktion darf nicht auf anderes gewartet werden
  const [fotoBuf, vorschauBuf] = await Promise.all([foto.arrayBuffer(), vorschau.arrayBuffer()]);
  const tx = (await db()).transaction(["teile", "fotos", "meta", "entwuerfe"], "readwrite");
  const meta = tx.objectStore("meta");
  let nr;
  meta.get("naechsteNr").onsuccess = e => {
    nr = e.target.result || 1;
    meta.put(nr + 1, "naechsteNr");
    tx.objectStore("teile").add({ ...angaben, vorschau: vorschauBuf, nr, erstellt: new Date().toISOString() });
    tx.objectStore("fotos").add(fotoBuf, nr);
  };
  if (entwurfId != null) tx.objectStore("entwuerfe").delete(entwurfId);
  await done(tx);
  return nr;
}
// Entwürfe: { id, datei?, dateiTyp?, hash?, foto?, vorschau?, r?, wahl?, ordner?, doppeltOk? }
// datei = Original-Foto, solange es noch nicht erkannt ist; danach foto/vorschau (verkleinert) und r = Ergebnis der KI.
// Bilder kommen als Blob herein und gehen als Blob heraus, gespeichert werden ArrayBuffer (siehe oben).
const BILDER = ["datei", "foto", "vorschau"];
export async function entwurfSpeichern(e) {
  const bufs = await Promise.all(BILDER.map(k => e[k] ? e[k].arrayBuffer() : null));
  const rec = { ...e };
  BILDER.forEach((k, i) => { if (bufs[i]) rec[k] = bufs[i]; else delete rec[k]; });
  const tx = (await db()).transaction("entwuerfe", "readwrite");
  tx.objectStore("entwuerfe").put(rec);
  await done(tx);
}
// Kleine Änderungen (Auswahl, Ordner …) ohne die Bilder neu zu schicken; gibt es den Entwurf nicht mehr, passiert nichts
export async function entwurfAendern(id, felder) {
  const tx = (await db()).transaction("entwuerfe", "readwrite"), E = tx.objectStore("entwuerfe");
  E.get(id).onsuccess = ev => { if (ev.target.result) E.put({ ...ev.target.result, ...felder }); };
  await done(tx);
}
export async function entwurfLoeschen(id) {
  const tx = (await db()).transaction("entwuerfe", "readwrite");
  tx.objectStore("entwuerfe").delete(id);
  await done(tx);
}
// Alle Entwürfe in der Reihenfolge, in der die Fotos ausgewählt wurden
export async function entwuerfe() {
  const alle = await request((await db()).transaction("entwuerfe").objectStore("entwuerfe").getAll());
  return alle.map(e => ({ ...e, datei: e.datei ? new Blob([e.datei], { type: e.dateiTyp || "image/jpeg" }) : null,
    foto: e.foto ? toBlob(e.foto) : null, vorschau: e.vorschau ? toBlob(e.vorschau) : null }));
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
// „geaendert“ = Zeitpunkt, damit die App sagen kann, was seit der letzten Sicherung anders ist.
export async function updateItems(changes) {
  const tx = (await db()).transaction("teile", "readwrite"), teile = tx.objectStore("teile"), jetzt = new Date().toISOString();
  for (const { nr, ...felder } of changes) {
    teile.get(nr).onsuccess = e => { if (e.target.result) teile.put({ ...e.target.result, ...felder, geaendert: jetzt }); };
  }
  await done(tx);
}
export const updateItem = (nr, felder) => updateItems([{ nr, ...felder }]);
// Alle Teile in EINEM Schritt durchgehen: fn(teil) gibt das geänderte Teil zurück oder null (dann bleibt es, wie es ist)
export async function updateAll(fn) {
  const tx = (await db()).transaction("teile", "readwrite"), teile = tx.objectStore("teile");
  teile.getAll().onsuccess = e => { for (const t of e.target.result) { const neu = fn(t); if (neu) teile.put(neu); } };
  await done(tx);
}
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
// „sonstGeaendert“ = wann zuletzt Ordner oder eigene Knöpfe geändert wurden (für „Seit deiner letzten Sicherung …“)
const merken = meta => meta.put(new Date().toISOString(), "sonstGeaendert");
export async function setFolders(folders) {
  const tx = (await db()).transaction("meta", "readwrite");
  tx.objectStore("meta").put(folders, "ordner"); merken(tx.objectStore("meta"));
  await done(tx);
}
// Ordner löschen: nur der Ordner verschwindet, die Teile bleiben (auch im Papierkorb wird er bei ihnen ausgetragen)
export async function deleteFolder(id) {
  const tx = (await db()).transaction(["teile", "meta"], "readwrite"), teile = tx.objectStore("teile"), meta = tx.objectStore("meta");
  teile.getAll().onsuccess = e => {
    for (const t of e.target.result) if (t.ordner?.includes(id)) teile.put({ ...t, ordner: t.ordner.filter(o => o !== id) });
  };
  meta.get("ordner").onsuccess = e => meta.put((e.target.result || []).filter(f => f.id !== id), "ordner");
  merken(meta);
  await done(tx);
}
// Welche Teile in einem Ordner liegen (Auswahl „Teile auswählen“): nrs = alle Nummern, die drin sein sollen.
// Teile im Papierkorb bleiben, wie sie sind: Sie stehen nicht zur Auswahl und kommen beim Wiederherstellen mit ihren Ordnern zurück.
export async function setFolderItems(id, nrs) {
  const tx = (await db()).transaction("teile", "readwrite"), teile = tx.objectStore("teile");
  teile.getAll().onsuccess = e => {
    for (const t of e.target.result) {
      if (t.geloescht) continue;
      const drin = !!t.ordner?.includes(id), soll = nrs.has(t.nr);
      if (drin !== soll) teile.put({ ...t, ordner: soll ? [...(t.ordner || []), id] : t.ordner.filter(o => o !== id), geaendert: new Date().toISOString() });
    }
  };
  await done(tx);
}
// Nummern wieder bei 001 beginnen. Geht nur, wenn es gar keine Teile mehr gibt, auch nicht im Papierkorb: Das wird im selben
// Schritt geprüft, in dem die Nummer zurückgesetzt wird. Gibt true zurück, wenn es geklappt hat.
// „letzteSicherung“ und die fertigen Outfits fallen weg, weil ihre Nummern sonst mit den neuen Teilen verwechselt würden.
export async function nummernZuruecksetzen() {
  const tx = (await db()).transaction(["teile", "fotos", "meta"], "readwrite");
  let ok = false;
  tx.objectStore("teile").count().onsuccess = e => {
    if (e.target.result !== 0) return;
    tx.objectStore("fotos").clear(); // auch die Fotos der fertigen Outfits
    tx.objectStore("meta").put(1, "naechsteNr");
    tx.objectStore("meta").delete("letzteSicherung");
    tx.objectStore("meta").delete("outfits");
    ok = true;
  };
  await done(tx);
  return ok;
}
// Großes Foto eines Teils (als Blob) oder null
export async function getPhoto(nr) {
  const buf = await request((await db()).transaction("fotos").objectStore("fotos").get(nr));
  return buf ? toBlob(buf) : null;
}
// Fertige Outfits (neueste zuerst)
export async function getOutfits() {
  return (await request((await db()).transaction("meta").objectStore("meta").get("outfits"))) || [];
}
const lookSchluessel = (id, klein = false) => (klein ? "outfit-klein:" : "outfit:") + id;
// Outfit neu anlegen oder ändern (gleiche id), in EINEM Schritt mit seinem Foto.
// foto: { gross, klein } (ArrayBuffer) = Foto setzen, null = Foto entfernen, weglassen = Foto bleibt, wie es ist
export async function saveOutfit(o, foto) {
  const tx = (await db()).transaction(["meta", "fotos"], "readwrite"), M = tx.objectStore("meta"), F = tx.objectStore("fotos");
  const neu = { ...o, geaendert: new Date().toISOString() };
  if (foto) { F.put(foto.gross, lookSchluessel(o.id)); F.put(foto.klein, lookSchluessel(o.id, true)); neu.foto = true; }
  else if (foto === null) { F.delete(lookSchluessel(o.id)); F.delete(lookSchluessel(o.id, true)); neu.foto = false; }
  M.get("outfits").onsuccess = e => {
    const alle = e.target.result || [];
    M.put(alle.some(x => x.id === o.id) ? alle.map(x => x.id === o.id ? neu : x) : [neu, ...alle], "outfits");
  };
  merken(M);
  await done(tx);
  return neu;
}
export async function deleteOutfit(id) {
  const tx = (await db()).transaction(["meta", "fotos"], "readwrite"), M = tx.objectStore("meta");
  M.get("outfits").onsuccess = e => M.put((e.target.result || []).filter(x => x.id !== id), "outfits");
  tx.objectStore("fotos").delete(lookSchluessel(id)); tx.objectStore("fotos").delete(lookSchluessel(id, true));
  merken(M);
  await done(tx);
}
// Foto vom Look (als Blob) oder null
export async function getLookFoto(id, klein = false) {
  const buf = await request((await db()).transaction("fotos").objectStore("fotos").get(lookSchluessel(id, klein)));
  return buf ? toBlob(buf) : null;
}
// Selbst eingetippte Einträge („Andere …“), pro Merkmal eine Liste: { Art: [{ wert, gruppe }], Farbe: [{ wert }], … }
// Liegen am selben Ort wie die Teile und kommen später mit in die Sicherung.
export async function getCustom() {
  return (await request((await db()).transaction("meta").objectStore("meta").get("eigeneWerte"))) || {};
}
export async function setCustom(custom) {
  const tx = (await db()).transaction("meta", "readwrite");
  tx.objectStore("meta").put(custom, "eigeneWerte"); merken(tx.objectStore("meta"));
  await done(tx);
}
// Einzelne Einträge in meta, z. B. "naechsteNr", "letzteSicherung" = { zeit, nrs } (was in der letzten ZIP war), "sonstGeaendert"
export async function getMeta(key) {
  return request((await db()).transaction("meta").objectStore("meta").get(key));
}
export async function setMeta(key, value) {
  const tx = (await db()).transaction("meta", "readwrite");
  tx.objectStore("meta").put(value, key);
  await done(tx);
}
// „Sicherung laden“: alles durch den Stand der Sicherung ersetzen, in EINEM Schritt.
// Klappt etwas nicht, bleibt der bisherige Stand komplett erhalten.
// teile: fertige Einträge (mit vorschau als ArrayBuffer), fotos: Map nr → ArrayBuffer (dazu die Fotos der Outfits unter
// "outfit:<id>" / "outfit-klein:<id>"), meta: { Schlüssel: Wert }
export async function replaceAll({ teile, fotos, meta }) {
  const tx = (await db()).transaction(["teile", "fotos", "meta"], "readwrite");
  const T = tx.objectStore("teile"), F = tx.objectStore("fotos"), M = tx.objectStore("meta");
  T.clear(); F.clear(); M.clear();
  for (const t of teile) T.put(t);
  for (const [nr, buf] of fotos) F.put(buf, nr);
  for (const [k, v] of Object.entries(meta)) if (v != null) M.put(v, k);
  await done(tx);
}
// Browser bitten, die Daten nicht beim Aufräumen zu löschen (Safari entscheidet selbst, ob er zustimmt)
export async function askPersist() {
  try { return navigator.storage?.persist ? await navigator.storage.persist() : false; } catch { return false; }
}
// Dreistellig mit führenden Nullen: 1 → "001"
export const nrText = nr => String(nr).padStart(3, "0");
