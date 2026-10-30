// „Was passt dazu?“: ein Teil antippen → Kombinationen aus dem Kleiderschrank + schlichte Kaufideen (Entscheidung 6).
// Die Rechnung steht in regeln.js, hier nur die Anzeige. Texte immer per textContent/DOM, nie per innerHTML.
import { el, fill, field, choice, beschreibung } from "./ui.js?v=10";
import { nrText } from "./speicher.js?v=7";
import { stilAktuell } from "./stil.js?v=9";
import { kandidaten, kombinationen, kaufideen } from "./regeln.js?v=2";

// Pro Sitzung gemerkt: abgewählte Ordner (neue Ordner sind damit automatisch angehakt) und der Schalter „Meinen Stil beachten“
const OHNE_ORDNER = "Ohne Ordner";
let abgewaehlt = new Set(), ohneOrdnerAn = true, stilAn = true;

// bild(blob) = Bild-Adresse (schrank.js gibt sie beim nächsten Zeichnen wieder frei)
export function renderPasst(box, kopf, items, folders, stil, nr, bild, oeffnen, neuZeichnen) {
  const anker = items.find(t => t.nr === nr);
  if (!anker) return false;
  const stilDaten = stilAktuell(stil), mitStil = stilAn ? stilDaten : { mode: stilDaten.mode };
  const angehakt = new Set(folders.map(f => f.id).filter(id => !abgewaehlt.has(id)));
  // Ohne eigene Ordner gibt es nichts abzuwählen. Kaufideen rechnen immer mit dem ganzen Schrank:
  // Was nur gerade abgewählt ist, fehlt ja nicht wirklich.
  const pool = kandidaten(items, folders.length ? { angehakt, ohneOrdner: ohneOrdnerAn } : null);
  const r = kombinationen(anker, pool, mitStil), ideen = kaufideen(anker, kandidaten(items), mitStil);

  const mini = (t, klein = false) => {
    const b = el("button", { type: "button", class: "teil mini" + (klein ? " klein" : "") },
      el("span", { class: "bild" }, el("img", { src: bild(t.vorschau), alt: beschreibung(t), loading: "lazy" }), el("span", { class: "plakette" }, nrText(t.nr))),
      el("span", { class: "text" }, `Nr. ${nrText(t.nr)} – ${beschreibung(t)}`));
    b.onclick = () => oeffnen(t.nr);
    return b;
  };
  const karte = (k, titel) => el("div", { class: "panel kombi" },
    titel ? el("div", { class: "kombi-titel" }, titel) : null,
    el("div", { class: "kombi-nummern" }, k.teile.map(t => `Nr. ${nrText(t.nr)}`).join(" + ")),
    el("div", { class: "kombi-teile" }, ...k.teile.map(t => mini(t))),
    k.extras.length ? el("div", { class: "note" }, "Dazu passt auch:") : null,
    k.extras.length ? el("div", { class: "kombi-teile" }, ...k.extras.map(t => mini(t, true))) : null,
    el("p", { class: "hint" }, k.warum),
    k.luecken.length ? el("p", { class: "hint" }, `Hier fehlen noch: ${k.luecken.join(", ")}.`) : null,
    k.tipps.length ? el("ul", { class: "tipps" }, ...k.tipps.map(x => el("li", {}, x))) : null);

  const ordnerWahl = folders.length ? field("Aus welchen Ordnern?", "Ein Teil kommt infrage, wenn es in mindestens einem angehakten Ordner liegt.",
    choice({ options: [...folders.map(f => f.name), OHNE_ORDNER], selected: [...folders.filter(f => angehakt.has(f.id)).map(f => f.name), ...(ohneOrdnerAn ? [OHNE_ORDNER] : [])], max: 0,
      onChange: sel => { abgewaehlt = new Set(folders.filter(f => !sel.includes(f.name)).map(f => f.id)); ohneOrdnerAn = sel.includes(OHNE_ORDNER); neuZeichnen(); } }).el) : null;
  const stilWahl = field("Meinen Stil beachten", "An: Was zu „Mein Stil“ passt, kommt zuerst. Weggelassen wird deswegen nichts.",
    choice({ options: ["An"], selected: stilAn ? ["An"] : [], onChange: sel => { stilAn = sel.length > 0; neuZeichnen(); } }).el);

  fill(box, kopf,
    el("div", { class: "panel" }, ordnerWahl, stilWahl),
    anker.nichtAnziehen ? el("p", { class: "hint" }, "Dieses Teil ist als „🚫 Ziehe ich nicht an“ markiert. Es kommt sonst in keinen Vorschlag.") : null,
    !r.kombis.length && pool.length < kandidaten(items).length ? el("p", { class: "hint" }, "Mit dieser Ordner-Auswahl findet die App nichts Passendes. Hake weitere Ordner an.")
      : r.hinweis ? el("p", { class: "hint" }, r.hinweis) : null,
    ...r.kombis.map((k, i) => karte(k, `Kombination ${i + 1}`)),
    r.anders ? karte(r.anders, "✨ Mal was anderes") : null,
    ideen.length ? el("div", { class: "panel" }, el("strong", {}, "🛍 Könnte noch fehlen"),
      el("ul", { class: "tipps" }, ...ideen.map(x => el("li", {}, el("strong", {}, x.was), ": ", x.warum)))) : null,
    el("p", { class: "hint" }, "Diese Vorschläge kommen aus festen Grundregeln der App (Farben, Schick-Stufe, Saison). Trends und kreativere Ideen kommen später über ChatGPT."));
  return true;
}
