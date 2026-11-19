// „🔍 Hab ich sowas schon?“ (seit 0.33, Wunsch 19.11.2026: „Man drückt drauf und kann das etwas fotografieren oder aus den eigenen
// Fotos wählen. Die App sagt dann ja oder nein und zeigt an welches hinterlegte falls ja“). Z. B. im Laden vor dem Kauf.
// Nur Kleidung: Der Haushalt hat bewusst keine KI (Entscheidung 19.11.2026). Verglichen wird der Bild-Abdruck der KI (Vektor, wie beim
// Doppel-Hinweis) mit allen Teilen im Kleiderschrank, ohne Papierkorb und ohne verkaufte. Das Foto wird nicht gespeichert und
// verlässt das Handy nicht. Texte nur per textContent/DOM.
import { el, fill, toast, fehlerToast, mitInfo, beschreibung, zeigeGross } from "./ui.js?v=21";
import { nrText } from "./speicher.js?v=12";
import { loadImage, alsJpg, recognize } from "./ki.js?v=9";
import { kiAnfordern } from "./ki-start.js?v=2";
import { istVerkauft } from "./verkauf.js?v=5";

// Grenzen für die Ähnlichkeit der Bild-Abdrücke (1 = gleiches Foto). Gemessen 19.11.2026 an 43 Herren-Fotos (903 Paare verschiedener
// Teile): gleiche Art und ähnlich aussehend 0,92–0,965 (helle Jeans untereinander, zwei Air-Force-Sneaker; 20 von 120 Paaren gleicher Art
// über 0,90), verschiedene Arten höchstens 0,896 (helle Jeans ~ beige Chino), meist um 0,66.
// JA: ab hier „Ja, so etwas hast du schon“ (bei passender Art). AEHNLICH: ab hier als ähnlich mit angezeigt.
// Ein Foto aus dem Laden ist noch nicht gemessen (anderes Licht, Bügel) – erst ein echter Versuch zeigt, ob die Grenzen passen.
const JA = 0.9, AEHNLICH = 0.87, MAX_TREFFER = 3;
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
let letztes = null; // { foto (Blob), ja, treffer: [{ nr, sim }], art, gleicheArt, ohneAbdruck } – bleibt, wenn sie ein Teil ansieht und zurückkommt
let laeuft = false;

// Vergleich: Ähnlichkeit der Bild-Abdrücke, dazu die Art. „Sehr ähnlich“ (und damit „Ja“) nur, wenn auch die Art zu einer der zwei
// wahrscheinlichsten Arten der KI passt (Test 19.11.2026: eine Jeans-Shorts kam bei einer Jeans sonst als „sehr ähnlich“), außer das
// Foto ist fast gleich (ab FAST_GLEICH, z. B. dasselbe Teil). Teile mit „sehr ähnlich“ zuerst.
const FAST_GLEICH = 0.95;
function vergleichen(r, items) {
  const da = items.filter(t => !t.geloescht && !istVerkauft(t));
  const mit = da.filter(t => t.vektor?.length === r.vektor.length);
  const arten = new Set(r.art.slice(0, 2).map(a => a.label)), art = r.art[0]?.label || null;
  const liste = mit.map(t => { const sim = dot(t.vektor, r.vektor); return { nr: t.nr, sim, sehr: sim >= FAST_GLEICH || (sim >= JA && arten.has(t.art)) }; })
    .sort((a, b) => (b.sehr - a.sehr) || (b.sim - a.sim));
  const ja = liste.some(x => x.sehr);
  return { ja, treffer: liste.filter(x => x.sehr || x.sim >= AEHNLICH).slice(0, MAX_TREFFER), naechstes: liste[0] || null, art,
    gleicheArt: mit.filter(t => t.art === art).length, ohneAbdruck: da.length - mit.length };
}

// oeffnen(nr) = Teil ansehen, bild(blob) = Bild-Adresse (schrank.js gibt sie beim nächsten Zeichnen frei)
export function renderSchonDa(box, kopf, items, bild, oeffnen, neuZeichnen) {
  const status = el("p", { class: "status" });
  const balken = el("div", { class: "bar", hidden: true }, el("div", {}));
  const nochmal = el("button", { type: "button", class: "btn", hidden: true }, "Nochmal versuchen");
  // Lädt die KI nicht (z. B. kein WLAN), bricht der Vergleich ab und „Nochmal versuchen“ nimmt dasselbe Foto (seit 0.33.2,
  // Durchsicht 19.11.2026: vorher wartete die Ansicht weiter, und ein neues Foto ergab nur „Einen Moment …“)
  let warteFoto = null;
  async function pruefen(datei) {
    if (laeuft) return toast("Einen Moment, die App vergleicht noch.");
    laeuft = true; nochmal.hidden = true; warteFoto = datei;
    let fehlgeschlagen;
    const fehler = new Promise((_, nein) => { fehlgeschlagen = nein; });
    const ki = kiAnfordern(s => {
      if (s.fertig) return;
      status.textContent = s.fehler ? s.text : s.text || "KI wird geladen …";
      balken.hidden = s.fehler; balken.firstChild.style.width = Math.round(100 * (s.anteil || 0)) + "%";
      if (s.fehler) fehlgeschlagen(new Error(s.text || "Die KI konnte nicht geladen werden."));
    });
    try {
      try { await Promise.race([ki.bereit, fehler]); }
      catch (e) { nochmal.hidden = false; return; } // Fehlertext steht schon in der Zeile darüber
      warteFoto = null;
      balken.hidden = true; status.textContent = "Foto wird verglichen …";
      const img = await loadImage(datei);
      let r, foto;
      try { r = await recognize(img); foto = await alsJpg(img, 600); }
      finally { r?.cut?.close?.(); URL.revokeObjectURL(img.src); }
      letztes = { foto, ...vergleichen(r, items) };
      status.textContent = "";
      neuZeichnen();
    } catch (e) { status.textContent = ""; fehlerToast("Vergleichen hat nicht geklappt", e); console.error(e); }
    finally { ki.aus(); laeuft = false; }
  }
  nochmal.onclick = () => { if (warteFoto) pruefen(warteFoto); else { nochmal.hidden = true; kiAnfordern(); } };
  // Ein Knopf (seit 0.33.1, iPhone-Test 19.11.2026): Das iPhone bietet dabei selbst „Fotomediathek“ und „Foto aufnehmen“ an,
  // ein eigener Kamera-Knopf war doppelt
  const input = el("input", { type: "file", accept: "image/*", hidden: true });
  input.onchange = () => { const d = input.files[0]; input.value = ""; if (d) pruefen(d); };
  const knopf = el("label", { class: "btn primary datei" }, "📷 Foto machen oder auswählen", input);
  const da = items.filter(t => !t.geloescht && !istVerkauft(t));

  // Ergebnis
  let ergebnis = null;
  if (letztes) {
    const nachNr = new Map(items.map(t => [t.nr, t]));
    const eigenes = el("img", { class: "schonda-foto", src: bild(letztes.foto), alt: "Dein Foto" });
    eigenes.onclick = () => zeigeGross(eigenes.src, "Dein Foto");
    const zeile = x => {
      const t = nachNr.get(x.nr);
      if (!t) return null;
      return el("button", { type: "button", class: "verkauf-zeile", onclick: () => oeffnen(t.nr) },
        el("img", { src: bild(t.vorschau), alt: "", loading: "lazy" }),
        el("span", {}, el("span", { class: "name" }, `Nr. ${nrText(t.nr)} – ${beschreibung(t)}`),
          el("span", { class: "unter" }, x.sehr ? "sieht sehr ähnlich aus" : x.aehnlich === false ? "am ähnlichsten, aber deutlich anders" : "sieht ähnlich aus")));
    };
    const treffer = letztes.treffer.map(zeile).filter(Boolean);
    const naechstes = !letztes.ja && letztes.naechstes && !letztes.treffer.length ? zeile({ ...letztes.naechstes, sehr: false, aehnlich: false }) : null;
    ergebnis = el("div", { class: "panel" },
      el("div", { class: "schonda-kopf" }, eigenes,
        el("div", {}, el("div", { class: "schonda-antwort" + (letztes.ja ? " ja" : " nein") }, letztes.ja ? "✅ Ja" : "❌ Nein"),
          el("p", {}, letztes.ja ? "So etwas hast du schon:" : treffer.length ? "Nicht genau so, aber ähnlich ist:" : "So etwas hast du noch nicht im Kleiderschrank."))),
      ...treffer,
      !letztes.ja && letztes.art && letztes.gleicheArt ? el("p", { class: "hint" }, `Die KI hält es für: ${letztes.art}. Davon hast du ${letztes.gleicheArt}, aber keins sieht so aus.`) : null,
      naechstes ? el("p", { class: "note" }, "Am ähnlichsten ist noch:") : null, naechstes,
      letztes.ohneAbdruck ? el("p", { class: "hint" }, `${letztes.ohneAbdruck} ${letztes.ohneAbdruck === 1 ? "Teil wurde" : "Teile wurden"} nicht verglichen (vor Version 0.7 gespeichert, ohne Bild-Abdruck).`) : null);
  }

  fill(box, kopf,
    el("div", { class: "panel" },
      mitInfo(el("strong", {}, "Foto machen oder auswählen"),
        "Fotografiere das Teil, z. B. im Laden, oder wähle ein Foto aus. Die App vergleicht es mit deinem Kleiderschrank und sagt dir, ob du so etwas schon hast.",
        "Sie vergleicht, wie es auf dem Foto aussieht (Art, Farbe, Form). Im Laden, auf dem Bügel oder bei anderem Licht sieht ein Teil anders aus als zu Hause fotografiert. Das Ergebnis ist darum eine Einschätzung.",
        "Nur Kleidung, Schuhe, Taschen und Schmuck – deine Sachen im Haushalt vergleicht die App nicht. Das Foto wird nicht gespeichert und bleibt auf deinem Handy.",
        "Beim ersten Mal lädt die App dafür ihre KI (ca. 100 MB, am besten im WLAN)."),
      el("div", { class: "actions" }, knopf),
      status, balken, nochmal),
    !da.length ? el("p", { class: "hint" }, "Speichere zuerst Kleidung, dann kann die App vergleichen.") : null,
    ergebnis);
}
