// „Outfit finden“: Anlass und Wetter antippen → Outfits aus dem Kleiderschrank (Entscheidung 4, oberer Teil: Vorschlag der App).
// Die Rechnung steht in regeln.js. Die ChatGPT-Anweisung kommt in der nächsten Etappe darunter.
// Texte immer per textContent/DOM, nie per innerHTML (ein eigener Anlass ist eingetippter Text).
import { el, fill, field, choice } from "./ui.js?v=11";
import { kandidaten, outfitsFuer, ANLAESSE, SCHICK_WAHL, TEMPERATUREN, WETTER } from "./regeln.js?v=5";
import { auswahlFelder, kombiKarte } from "./passt.js?v=5";

// Pro Sitzung gemerkt, damit die Auswahl noch da ist, wenn man ein Teil ansieht und zurückkommt
let anlass = null, schickWahl = null, temperatur = null, wetter = [], mehrOffen = false;

// bild(blob) = Bild-Adresse (schrank.js gibt sie beim nächsten Zeichnen wieder frei), oeffnen(nr) = Teil ansehen
export function renderOutfit(box, kopf, items, folders, stil, bild, oeffnen, neuZeichnen) {
  const { ordnerWahl, stilWahl, pool, mitStil } = auswahlFelder(items, folders, stil, neuZeichnen);
  const r = outfitsFuer({ anlass, schickWahl, temperatur, wetter }, pool, mitStil);

  const einer = (werte, wert, setzen) => choice({ options: werte, selected: wert ? [wert] : [], onChange: sel => { setzen(sel[0] || null); neuZeichnen(); } }).el;
  const namen = Object.keys(ANLAESSE);
  const anlassWahl = choice({ field: "Anlass", options: namen, selected: anlass ? [anlass] : [], beispiel: "z. B. Konzert", aehnlich: { liste: namen, pflicht: true },
    onChange: sel => { anlass = sel[0] || null; neuZeichnen(); } });
  box.dispose = () => anlassWahl.dispose();
  const wetterWahl = choice({ options: WETTER, selected: wetter, max: 0, onChange: sel => { wetter = sel; neuZeichnen(); } });
  const mehr = el("details", { class: "mehr" }, el("summary", {}, "Ordner und „Mein Stil“"), ordnerWahl, stilWahl);
  mehr.open = mehrOffen;
  mehr.ontoggle = () => { mehrOffen = mehr.open; };

  const ergebnis = el("div", {});
  const zuDenVorschlaegen = el("button", { type: "button", class: "link" }, "Zu den Vorschlägen ↓");
  zuDenVorschlaegen.onclick = () => ergebnis.scrollIntoView({ behavior: "smooth" });
  const fuer = [anlass, schickWahl, temperatur, ...wetter].filter(Boolean).join(" · ");
  fill(ergebnis,
    el("h2", {}, "Vorschläge"),
    fuer ? el("p", { class: "hint" }, `Für: ${fuer}`) : el("p", { class: "hint" }, "Tippe oben an, wofür es ist und wie das Wetter wird, dann passen die Vorschläge besser."),
    !r.kombis.length && pool.length < kandidaten(items).length ? el("p", { class: "hint" }, "Mit dieser Ordner-Auswahl findet die App nichts Passendes. Hake weitere Ordner an.")
      : r.hinweis ? el("p", { class: "hint" }, r.hinweis) : null,
    ...r.kombis.map((k, i) => kombiKarte(k, `Outfit ${i + 1}`, bild, oeffnen)),
    r.anders ? kombiKarte(r.anders, "✨ Mal was anderes", bild, oeffnen) : null,
    el("p", { class: "hint" }, "Diese Vorschläge kommen aus festen Grundregeln der App (Farben, Schick-Stufe, Wetter, Anlass). Trends und kreativere Ideen kommen später über ChatGPT."));

  fill(box, kopf,
    el("div", { class: "panel" },
      field("Wofür?", null, anlassWahl.el),
      field("Wie schick?", "Freiwillig. Sonst richtet es sich nach dem Anlass.", einer(Object.keys(SCHICK_WAHL), schickWahl, x => { schickWahl = x; })),
      field("Temperatur", null, einer(Object.keys(TEMPERATUREN), temperatur, x => { temperatur = x; })),
      field("Wetter", "Mehrere möglich.", wetterWahl.el),
      mehr,
      el("div", { class: "actions" }, zuDenVorschlaegen)),
    ergebnis);
}
