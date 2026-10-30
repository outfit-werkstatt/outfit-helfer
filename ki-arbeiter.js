// Läuft im Hintergrund (Web Worker), damit die Seite nicht einfriert, während die KI 5–6 Sekunden pro Foto rechnet.
// ki.js startet diese Datei über eine kleine blob:-Datei: Nur so gilt die Hausregel der Seite (CSP) auch hier.
// Die Hausregel verbietet eval, das lässt sich ohne Netzwerk prüfen. Gilt sie hier nicht, wird die KI-Bibliothek gar nicht
// erst geladen, und ki.js rechnet in der Seite, wo sie sicher gilt.
let hausregel = false;
try { (0, eval)("1"); } catch { hausregel = true; }

if (hausregel) {
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
}
postMessage({ typ: "da", hausregel });
