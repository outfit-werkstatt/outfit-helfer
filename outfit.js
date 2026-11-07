// „Outfit finden“: Anlass und Wetter antippen → erst die Anfrage an ChatGPT/Gemini (chatgpt.js), darunter eingeklappt die
// Outfits der App aus festen Regeln (regeln.js). Reihenfolge seit 0.17, siehe appKlappe in passt.js.
// Texte immer per textContent/DOM, nie per innerHTML (ein eigener Anlass ist eingetippter Text).
import { el, fill, field, choice } from "./ui.js?v=18";
import { kandidaten, outfitsFuer, ANLAESSE, SCHICK_WAHL, TEMPERATUREN, WETTER } from "./regeln.js?v=15";
import { auswahlFelder, kombiKarte, miniKachel, appKlappe } from "./passt.js?v=21";
import { chatgptPanel } from "./chatgpt.js?v=15";

// Pro Sitzung gemerkt, damit die Auswahl noch da ist, wenn man ein Teil ansieht und zurückkommt
let anlass = null, schickWahl = null, temperatur = null, wetter = [], einstellOffen = false, appOffen = false;

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

  const ergebnis = el("div", {});
  const zuDenVorschlaegen = el("button", { type: "button", class: "link" }, "Zu den Vorschlägen ↓");
  zuDenVorschlaegen.onclick = () => ergebnis.scrollIntoView({ behavior: "smooth" });
  const fuer = [anlass, schickWahl, temperatur, ...wetter].filter(Boolean).join(" · ");
  fill(ergebnis,
    el("h2", {}, "Vorschläge"),
    fuer ? el("p", { class: "hint" }, `Für: ${fuer}`) : el("p", { class: "hint" }, "Tippe oben an, wofür es ist und wie das Wetter wird, dann passen die Vorschläge besser."),
    chatgptPanel(items, stil, { situation: { anlass, schickWahl, temperatur, wetter } }, t => miniKachel(t, bild, oeffnen)),
    appKlappe({ anzahl: r.kombis.length + (r.anders ? 1 : 0), art: ["Outfit", "Outfits"], offen: appOffen, umschalten: x => { appOffen = x; },
      einstellungen: [ordnerWahl, stilWahl], einstellOffen, einstellUmschalten: x => { einstellOffen = x; } },
      !r.kombis.length && pool.length < kandidaten(items).length ? el("p", { class: "hint" }, "Mit dieser Ordner-Auswahl findet die App nichts Passendes. Hake weitere Ordner an.")
        : r.hinweis ? el("p", { class: "hint" }, r.hinweis) : null,
      ...r.kombis.map((k, i) => kombiKarte(k, `Outfit ${i + 1}`, bild, oeffnen, fuer || "Outfit")),
      r.anders ? kombiKarte(r.anders, "✨ Mal was anderes", bild, oeffnen, fuer ? `${fuer} (mal anders)` : "Mal was anderes") : null));

  fill(box, kopf,
    el("div", { class: "panel" },
      field("Wofür?", null, anlassWahl.el),
      field("Wie schick?", "freiwillig", einer(Object.keys(SCHICK_WAHL), schickWahl, x => { schickWahl = x; }), "Ohne Angabe richtet es sich nach dem Anlass."),
      field("Temperatur", null, einer(Object.keys(TEMPERATUREN), temperatur, x => { temperatur = x; })),
      field("Wetter", "Mehrere möglich.", wetterWahl.el),
      el("div", { class: "actions" }, zuDenVorschlaegen)),
    ergebnis);
}
