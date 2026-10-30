// Läuft im Hintergrund (Web Worker), damit die Seite nicht einfriert, während die KI 5–6 Sekunden pro Foto rechnet.
// ki.js startet diese Datei über eine kleine blob:-Datei: Nur so gilt die Hausregel der Seite (CSP) auch hier.
// Zusätzlich sperrt diese Datei den Weg nach außen selbst, bevor die KI-Bibliothek geladen wird
// (zweite Sicherung: GitHub Pages kann keine CSP-Kopfzeile für diese Datei mitschicken).
const eigen = new URL(import.meta.url).origin, echtesFetch = self.fetch.bind(self);
self.fetch = (adresse, optionen) => new URL(adresse instanceof Request ? adresse.url : adresse, import.meta.url).origin === eigen
  ? echtesFetch(adresse, optionen) : Promise.reject(new Error("Nur die eigene Seite ist erlaubt."));
for (const n of ["XMLHttpRequest", "WebSocket", "EventSource", "WebTransport", "Worker", "SharedWorker"]) { try { delete self[n]; self[n] = undefined; } catch {} }
// Gilt die Hausregel hier wirklich? Sie verbietet eval, das lässt sich ohne Netzwerk prüfen (nur für die Testanzeige).
let hausregel = false;
try { (0, eval)("1"); } catch { hausregel = true; }

const { loadAI, recognize } = await import("./ki-rechnen.js?v=1");
self.onmessage = async ({ data: { id, typ, bild, erzeugen } }) => {
  try {
    if (typ === "laden") {
      const ergebnis = await loadAI((...werte) => postMessage({ id, typ: "fortschritt", werte }), erzeugen);
      postMessage({ id, ok: true, ergebnis });
    } else {
      const r = await recognize(bild);
      postMessage({ id, ok: true, ergebnis: r }, r.cut ? [r.cut, r.vektor.buffer] : [r.vektor.buffer]);
    }
  } catch (e) { postMessage({ id, ok: false, text: e?.message || String(e), dateien: e?.dateien }); }
};
postMessage({ typ: "da", hausregel });
