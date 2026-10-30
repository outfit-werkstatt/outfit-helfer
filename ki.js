// Erkennung für die App, Seite der Bedienung: Begriffe (ki-listen.js), Bilder laden und verkleinern, Auftrag an die KI.
// Die KI rechnet 5–6 Sekunden pro Foto. Täte sie das in der Seite, könnte das iPhone so lange nichts zeichnen und beim
// Scrollen bliebe alles schwarz. Darum rechnet sie im Hintergrund (ki-arbeiter.js, ki-rechnen.js).
export * from "./ki-listen.js?v=1";

/* ---------- Bilder ---------- */
const canvasToBlob = (c, q = 0.9) => new Promise(r => c.toBlob(r, "image/jpeg", q));
// Die Bild-Adresse (img.src) erst nach dem letzten Zeichnen freigeben: URL.revokeObjectURL(img.src)
export function loadImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => res(img);
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("Bild konnte nicht gelesen werden (HEIC? Dann als JPG speichern)")); };
    img.src = url;
  });
}
// fein = sorgfältig verkleinern (für gespeicherte Fotos). Die KI bekommt bewusst die einfache Verkleinerung,
// damit sie genau so rechnet wie bei den Messungen.
export function toCanvas(img, max, fein = false) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, s = Math.min(1, max / Math.max(w, h));
  const c = document.createElement("canvas"); c.width = Math.round(w * s); c.height = Math.round(h * s);
  const ctx = c.getContext("2d"); if (fein) ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, c.width, c.height); return c;
}
// Bild verkleinert als JPG. Die Zeichenfläche wird gleich freigegeben: iOS begrenzt ihren Speicher, und seit die KI nicht mehr
// in der Seite rechnet, räumt die Seite seltener von selbst auf.
export async function alsJpg(quelle, max, q = 0.85) {
  const c = toCanvas(quelle, max, true), blob = await canvasToBlob(c, q);
  c.width = c.height = 0;
  return blob;
}

/* ---------- Auftrag an die KI ---------- */
// Für die Testanzeige: wo die KI rechnet, warum (falls sie in der Seite rechnet) und wie lange das letzte Foto gedauert hat
export const kiInfo = { weg: "wird gestartet", grund: "", sekunden: null };
// Wartezeit, die nur läuft, solange die App sichtbar ist: In einer anderen App friert das iPhone alles ein,
// und wer zurückkommt, soll nicht wie ein Hintergrund aussehen, der sich nicht meldet. Gibt die Funktion zum Abstellen zurück.
function sichtbareUhr(ms, dann) {
  let t = null;
  const stellen = () => { clearTimeout(t); if (document.visibilityState === "visible") t = setTimeout(() => { aus(); dann(); }, ms); };
  const aus = () => { clearTimeout(t); document.removeEventListener("visibilitychange", stellen); };
  document.addEventListener("visibilitychange", stellen); stellen();
  return aus;
}
const START_ZEIT = 30000, FOTO_ZEIT = 120000; // ein Foto dauert auf dem iPhone 5–6 Sekunden
// Startet den Hintergrund. blob:-Datei, weil nur so die Hausregel der Seite auch dort gilt (GitHub Pages kann keine Kopfzeile setzen).
function imHintergrund() {
  return new Promise((res, rej) => {
    const code = `import ${JSON.stringify(new URL("ki-arbeiter.js?v=1", import.meta.url).href)};`;
    const adresse = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
    const w = new Worker(adresse, { type: "module" }), offen = new Map();
    let id = 0, bereit = false;
    const uhrAus = sichtbareUhr(START_ZEIT, () => scheitert("Der Hintergrund meldet sich nicht"));
    const scheitert = text => { uhrAus(); URL.revokeObjectURL(adresse); w.terminate(); rej(new Error(text)); };
    const frage = (auftrag, mit, fortschritt, frist) => new Promise((ok, nein) => {
      const nr = ++id, aus = frist ? sichtbareUhr(frist, () => { offen.delete(nr); nein(new Error("Der Hintergrund antwortet nicht")); }) : () => {};
      offen.set(nr, { ok: x => { aus(); ok(x); }, nein: e => { aus(); nein(e); }, fortschritt });
      w.postMessage({ id: nr, ...auftrag }, mit);
    });
    w.onmessage = ({ data: d }) => {
      if (d.typ === "da") {
        if (!d.hausregel) { scheitert("Die Hausregel gilt im Hintergrund nicht"); return; }
        uhrAus(); URL.revokeObjectURL(adresse); bereit = true;
        kiInfo.weg = "Hintergrund"; kiInfo.grund = "";
        res({ loadAI: (fortschritt, erzeugen) => frage({ typ: "laden", erzeugen }, [], fortschritt),
          recognize: bild => frage({ typ: "erkennen", bild }, [bild], null, FOTO_ZEIT), beenden: () => w.terminate() });
        return;
      }
      const auftrag = offen.get(d.id);
      if (!auftrag) return;
      if (d.typ === "fortschritt") { auftrag.fortschritt?.(...d.werte); return; }
      offen.delete(d.id);
      if (d.ok) auftrag.ok(d.ergebnis); else auftrag.nein(Object.assign(new Error(d.text), { dateien: d.dateien }));
    };
    w.onerror = e => {
      e.preventDefault();
      if (!bereit) { scheitert(e.message || "Der Hintergrund startet nicht"); return; }
      for (const { nein } of offen.values()) nein(new Error(e.message || "Die KI wurde unterbrochen"));
      offen.clear();
    };
  });
}
// Geht der Hintergrund nicht, rechnet die KI wie früher in der Seite: stockender zu bedienen, aber sie funktioniert.
async function inDerSeite(grund) {
  console.warn("KI rechnet in der Seite:", grund);
  const m = await import("./ki-rechnen.js?v=1");
  kiInfo.weg = "in der Seite"; kiInfo.grund = grund?.message || String(grund);
  return m;
}
let rechner = null;
const merke = p => (rechner = p.catch(e => { rechner = null; throw e; }));
const holeRechner = () => rechner ?? merke(imHintergrund().catch(inDerSeite));
// onProgress(Anteil 0…1, geladene MB, gesamte MB). Gibt bei ?begriffe-erzeugen eine Meldung zurück.
// Bei einem Fehler steht in fehler.dateien, welche Dateien noch nicht fertig waren.
export async function loadAI(onProgress) {
  // Nur am PC (localhost): sonst könnte ein fremder Link mit ?begriffe-erzeugen den Start der App stören
  const erzeugen = location.hostname === "localhost" && new URLSearchParams(location.search).has("begriffe-erzeugen");
  const r = await holeRechner();
  try { return await r.loadAI(onProgress, erzeugen); }
  catch (e) {
    if (!r.beenden) throw e;
    // Lag es am Hintergrund? Das zeigt nur ein Versuch in der Seite. Reißt bloß der Download ab, scheitert auch der,
    // und der nächste Versuch beginnt wieder im Hintergrund.
    r.beenden();
    const seite = await merke(inDerSeite(e));
    try { return await seite.loadAI(onProgress, erzeugen); }
    catch (e2) { rechner = null; throw e2; }
  }
}
// Liefert die ausgeschnittene Vorschau (ImageBitmap oder null, danach schließen) und pro Merkmal alle Begriffe sortiert nach Wahrscheinlichkeit.
export async function recognize(img) {
  const bild = async () => { const c = toCanvas(img, 448), b = await createImageBitmap(c); c.width = c.height = 0; return b; };
  const erstes = await bild(), start = performance.now(), r = await holeRechner();
  let ergebnis;
  try { ergebnis = await r.recognize(erstes); }
  catch (e) {
    if (!r.beenden) throw e;
    // Rechnet der Hintergrund falsch oder gar nicht mehr, übernimmt die Seite: KI dort laden, dieses Foto noch einmal
    r.beenden();
    const seite = await merke(inDerSeite(e).then(async m => { await m.loadAI(() => {}); return m; }));
    ergebnis = await seite.recognize(await bild());
  }
  kiInfo.sekunden = (performance.now() - start) / 1000;
  return ergebnis;
}
