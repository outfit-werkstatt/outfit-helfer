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
export { canvasToBlob };

/* ---------- Auftrag an die KI ---------- */
// Für die Testanzeige: wo die KI rechnet und ob die Hausregel (CSP) dort gilt
export const kiInfo = { weg: "wird gestartet", hausregel: null, sekunden: null };
// Startet den Hintergrund. blob:-Datei, weil nur so die Hausregel der Seite auch dort gilt (GitHub Pages kann keine Kopfzeile setzen).
function imHintergrund() {
  return new Promise((res, rej) => {
    const code = `import ${JSON.stringify(new URL("ki-arbeiter.js?v=1", import.meta.url).href)};`;
    const adresse = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
    const w = new Worker(adresse, { type: "module" }), offen = new Map();
    let id = 0, bereit = false;
    const scheitert = text => { clearTimeout(uhr); URL.revokeObjectURL(adresse); w.terminate(); rej(new Error(text)); };
    const uhr = setTimeout(() => scheitert("Der Hintergrund meldet sich nicht"), 30000);
    const frage = (auftrag, mit = [], fortschritt) => new Promise((ok, nein) => { offen.set(++id, { ok, nein, fortschritt }); w.postMessage({ id, ...auftrag }, mit); });
    w.onmessage = ({ data: d }) => {
      if (d.typ === "da") {
        clearTimeout(uhr); URL.revokeObjectURL(adresse); bereit = true;
        kiInfo.weg = "Hintergrund"; kiInfo.hausregel = d.hausregel;
        res({ loadAI: (fortschritt, erzeugen) => frage({ typ: "laden", erzeugen }, [], fortschritt), recognize: bild => frage({ typ: "erkennen", bild }, [bild]) });
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
// Geht der Hintergrund nicht, rechnet die KI wie früher in der Seite: langsamer zu bedienen, aber sie funktioniert.
let rechner = null;
function holeRechner() {
  rechner ??= imHintergrund().catch(async e => {
    console.warn("KI rechnet in der Seite:", e);
    const m = await import("./ki-rechnen.js?v=1");
    kiInfo.weg = "in der Seite"; kiInfo.hausregel = true;
    return m;
  }).catch(e => { rechner = null; throw e; });
  return rechner;
}
// onProgress(Anteil 0…1, geladene MB, gesamte MB). Gibt bei ?begriffe-erzeugen eine Meldung zurück.
// Bei einem Fehler steht in fehler.dateien, welche Dateien noch nicht fertig waren.
export async function loadAI(onProgress) {
  // Nur am PC (localhost): sonst könnte ein fremder Link mit ?begriffe-erzeugen den Start der App stören
  const erzeugen = location.hostname === "localhost" && new URLSearchParams(location.search).has("begriffe-erzeugen");
  return (await holeRechner()).loadAI(onProgress, erzeugen);
}
// Liefert die ausgeschnittene Vorschau (ImageBitmap oder null, danach schließen) und pro Merkmal alle Begriffe sortiert nach Wahrscheinlichkeit.
export async function recognize(img) {
  const bild = await createImageBitmap(toCanvas(img, 448)), start = performance.now();
  const r = await (await holeRechner()).recognize(bild);
  kiInfo.sekunden = (performance.now() - start) / 1000;
  return r;
}
