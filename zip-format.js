// ZIP-Dateien schreiben und lesen, selbst geschrieben (keine fremde Bibliothek, nichts verlässt das Gerät).
// Schreiben: Dateien werden nur „eingepackt“, nicht gepackt (Fotos lassen sich ohnehin kaum verkleinern).
// Lesen: Stück für Stück aus der Datei (nie alles auf einmal im Speicher), gepackt (Deflate) und ungepackt;
// jede Datei wird erst entpackt, wenn sie wirklich gebraucht wird, mit Größengrenze und Prüfsumme.
// Unerwartete oder kaputte Dateien richten so keinen Schaden an.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
const utf8 = new TextEncoder();
const zeitDos = d => (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
const datumDos = d => ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();

// dateien: [{ name, data: Blob oder Uint8Array }] → Blob (ZIP). Namen in UTF-8 (Kennzeichen 0x0800), damit Umlaute stimmen.
// Blobs werden nur kurz für die Prüfsumme gelesen und dann als Verweis eingepackt, nicht kopiert (spart Speicher auf dem Handy).
export async function zipErstellen(dateien, jetzt = new Date(), fortschritt = () => {}) {
  const teile = [], zentral = [];
  let offset = 0;
  for (const [i, { name, data }] of dateien.entries()) {
    fortschritt(i, dateien.length);
    const bytes = data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data;
    const n = utf8.encode(name), crc = crc32(bytes), laenge = bytes.length;
    const kopf = new DataView(new ArrayBuffer(30));
    kopf.setUint32(0, 0x04034b50, true); kopf.setUint16(4, 20, true); kopf.setUint16(6, 0x0800, true); kopf.setUint16(8, 0, true);
    kopf.setUint16(10, zeitDos(jetzt), true); kopf.setUint16(12, datumDos(jetzt), true); kopf.setUint32(14, crc, true);
    kopf.setUint32(18, laenge, true); kopf.setUint32(22, laenge, true); kopf.setUint16(26, n.length, true); kopf.setUint16(28, 0, true);
    const z = new DataView(new ArrayBuffer(46));
    z.setUint32(0, 0x02014b50, true); z.setUint16(4, 20, true); z.setUint16(6, 20, true); z.setUint16(8, 0x0800, true); z.setUint16(10, 0, true);
    z.setUint16(12, zeitDos(jetzt), true); z.setUint16(14, datumDos(jetzt), true); z.setUint32(16, crc, true);
    z.setUint32(20, laenge, true); z.setUint32(24, laenge, true); z.setUint16(28, n.length, true);
    z.setUint32(42, offset, true);
    teile.push(kopf, n, data); zentral.push(z, n);
    offset += 30 + n.length + laenge;
    if (offset > 0xFFFFFFF0) throw new Error("Die Sicherung wäre größer als 4 GB");
  }
  if (dateien.length > 0xFFFF) throw new Error("Zu viele Dateien für eine Sicherung");
  const groesse = zentral.reduce((s, x) => s + x.byteLength, 0), ende = new DataView(new ArrayBuffer(22));
  ende.setUint32(0, 0x06054b50, true); ende.setUint16(8, dateien.length, true); ende.setUint16(10, dateien.length, true);
  ende.setUint32(12, groesse, true); ende.setUint32(16, offset, true);
  return new Blob([...teile, ...zentral, ende], { type: "application/zip" });
}

// datei: Blob/File der ZIP. Liefert [{ name, groesse, lesen() }]. Namen mit „/“ als Trenner (Windows schreibt manchmal „\“).
// lesen() holt nur dieses eine Stück aus der Datei, entpackt höchstens maxDatei Bytes und prüft die Prüfsumme.
// Wirft einen Fehler mit verständlicher Meldung, wenn die Datei keine (lesbare) ZIP ist.
export async function zipLesen(datei, { maxEintraege = 5000, maxDatei = 30e6 } = {}) {
  const groesse = datei.size, kaputt = () => new Error("Die Datei ist keine lesbare ZIP-Sicherung.");
  const stueck = async (von, bis) => new Uint8Array(await datei.slice(von, bis).arrayBuffer());
  // Ende-Eintrag von hinten suchen (dahinter darf höchstens ein Kommentar stehen)
  const hinten = Math.max(0, groesse - 22 - 65535), tail = await stueck(hinten, groesse), tv = new DataView(tail.buffer);
  let e = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (tv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw kaputt();
  const anzahl = tv.getUint16(e + 10, true), cdGroesse = tv.getUint32(e + 12, true), start = tv.getUint32(e + 16, true);
  if (anzahl === 0xFFFF || start === 0xFFFFFFFF) throw new Error("Diese ZIP-Art (ZIP64) wird nicht unterstützt.");
  if (anzahl > maxEintraege) throw new Error(`Die ZIP enthält zu viele Dateien (${anzahl}).`);
  if (start + cdGroesse > hinten + e || cdGroesse > 50e6) throw kaputt();
  const cd = await stueck(start, start + cdGroesse), v = new DataView(cd.buffer);
  const dec = new TextDecoder("utf-8", { fatal: false }), liste = [];
  let p = 0;
  for (let k = 0; k < anzahl; k++) {
    if (p + 46 > cd.length || v.getUint32(p, true) !== 0x02014b50) throw kaputt();
    const flags = v.getUint16(p + 8, true), methode = v.getUint16(p + 10, true), crc = v.getUint32(p + 16, true);
    const gepackt = v.getUint32(p + 20, true), echt = v.getUint32(p + 24, true);
    const nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), lokal = v.getUint32(p + 42, true);
    const name = dec.decode(cd.subarray(p + 46, p + 46 + nl)).replace(/\\/g, "/");
    p += 46 + nl + xl + cl;
    if (name.endsWith("/")) continue; // Ordner-Eintrag
    liste.push({ name, groesse: echt, lesen: async () => {
      if (flags & 1) throw new Error(`${name}: verschlüsselt`);
      if (methode !== 0 && methode !== 8) throw new Error(`${name}: unbekannte Pack-Art`);
      if (echt > maxDatei || gepackt > maxDatei) throw new Error(`${name}: zu groß`);
      if (lokal + 30 > groesse) throw kaputt();
      const kopf = await stueck(lokal, lokal + 30), kv = new DataView(kopf.buffer);
      if (kv.getUint32(0, true) !== 0x04034b50) throw kaputt();
      const von = lokal + 30 + kv.getUint16(26, true) + kv.getUint16(28, true);
      if (von + gepackt > groesse) throw kaputt();
      const roh = await stueck(von, von + gepackt);
      const daten = methode === 0 ? roh : await entpacken(roh, echt, name);
      if (daten.length !== echt || crc32(daten) !== crc) throw new Error(`${name}: beschädigt (Prüfsumme stimmt nicht)`);
      return daten;
    } });
  }
  return liste;
}
// Deflate entpacken und abbrechen, sobald mehr herauskommt als angegeben (Schutz vor „ZIP-Bomben“)
async function entpacken(roh, echt, name) {
  if (typeof DecompressionStream === "undefined") throw new Error(`${name}: gepackte ZIP-Dateien kann dieser Browser nicht lesen`);
  const leser = new Blob([roh]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const out = new Uint8Array(echt); let n = 0;
  for (;;) {
    const { done, value } = await leser.read();
    if (done) break;
    if (n + value.length > echt) { leser.cancel(); throw new Error(`${name}: beschädigt (größer als angegeben)`); }
    out.set(value, n); n += value.length;
  }
  return out.subarray(0, n);
}
