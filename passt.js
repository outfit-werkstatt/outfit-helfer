// „Was passt dazu?“: ein Teil antippen → Kombinationen aus dem Kleiderschrank + schlichte Kaufideen (Entscheidung 6).
// Die Rechnung steht in regeln.js, hier nur die Anzeige. Texte immer per textContent/DOM, nie per innerHTML.
// Die Ordner-Auswahl und die Kombi-Karten nutzt auch „Outfit finden“ (outfit.js).
import { el, fill, field, choice, mitInfo, beschreibung } from "./ui.js?v=13";
import { nrText } from "./speicher.js?v=9";
import { stilAktuell } from "./stil.js?v=13";
import { kandidaten, kombinationen, kaufideen } from "./regeln.js?v=8";
import { chatgptPanel, bildPaketBereich } from "./chatgpt.js?v=4";
import { speichernKnopf } from "./fertig.js?v=1";

// Pro Sitzung gemerkt: abgewählte Ordner (neue Ordner sind damit automatisch angehakt) und der Schalter „Meinen Stil beachten“
const OHNE_ORDNER = "Ohne Ordner";
let abgewaehlt = new Set(), ohneOrdnerAn = true, stilAn = true;

// Knöpfe „Aus welchen Ordnern?“ und „Meinen Stil beachten“. Liefert die Felder, die infrage kommenden Teile und „Mein Stil“ zum Rechnen.
export function auswahlFelder(items, folders, stil, neuZeichnen) {
  const stilDaten = stilAktuell(stil), mitStil = stilAn ? stilDaten : { mode: stilDaten.mode };
  const angehakt = new Set(folders.map(f => f.id).filter(id => !abgewaehlt.has(id)));
  // Ohne eigene Ordner gibt es nichts abzuwählen
  const pool = kandidaten(items, folders.length ? { angehakt, ohneOrdner: ohneOrdnerAn } : null);
  const ordnerWahl = folders.length ? field("Aus welchen Ordnern?", null,
    choice({ options: [...folders.map(f => f.name), OHNE_ORDNER], selected: [...folders.filter(f => angehakt.has(f.id)).map(f => f.name), ...(ohneOrdnerAn ? [OHNE_ORDNER] : [])], max: 0,
      onChange: sel => { abgewaehlt = new Set(folders.filter(f => !sel.includes(f.name)).map(f => f.id)); ohneOrdnerAn = sel.includes(OHNE_ORDNER); neuZeichnen(); } }).el,
    "Ein Teil kommt infrage, wenn es in mindestens einem angehakten Ordner liegt. „Ohne Ordner“ sind die Teile, die in keinem eigenen Ordner liegen.") : null;
  const stilWahl = field("Meinen Stil beachten", null,
    choice({ options: ["An"], selected: stilAn ? ["An"] : [], onChange: sel => { stilAn = sel.length > 0; neuZeichnen(); } }).el,
    "An: Was zu „Mein Stil“ passt, kommt zuerst. Weggelassen wird deswegen nichts.");
  return { ordnerWahl, stilWahl, pool, mitStil };
}

// Kleine Kachel eines Teils (antippen → Teil ansehen). bild(blob) = Bild-Adresse (schrank.js gibt sie beim nächsten Zeichnen wieder frei)
export function miniKachel(t, bild, oeffnen, klein = false) {
  const b = el("button", { type: "button", class: "teil mini" + (klein ? " klein" : "") },
    el("span", { class: "bild" }, el("img", { src: bild(t.vorschau), alt: beschreibung(t), loading: "lazy" }), el("span", { class: "plakette" }, nrText(t.nr))),
    el("span", { class: "text" }, `Nr. ${nrText(t.nr)} – ${beschreibung(t)}`));
  b.onclick = () => oeffnen(t.nr);
  return b;
}
// Eine Kombination mit Nummern, kleinen Fotos, Begründung und Tipps. name = Vorschlag für den Namen beim Speichern
export function kombiKarte(k, titel, bild, oeffnen, name = titel) {
  const mini = (t, klein = false) => miniKachel(t, bild, oeffnen, klein);
  // Bild-Paket erst auf Wunsch (die Ansicht wird bei jedem Tippen neu gezeichnet). Nur die Kleidung, nicht „Dazu passt auch“.
  const paketBox = el("div", {}), paketKnopf = el("button", { type: "button", class: "btn" }, "🖼 Bild von diesem Outfit");
  paketKnopf.onclick = () => { const b = bildPaketBereich(k.teile, "diesem Outfit aus meinem Kleiderschrank"); paketKnopf.hidden = true; fill(paketBox, b.el); b.erstellen(); };
  return el("div", { class: "panel kombi" },
    titel ? el("div", { class: "kombi-titel" }, titel) : null,
    el("div", { class: "kombi-nummern" }, k.teile.map(t => `Nr. ${nrText(t.nr)}`).join(" + ")),
    el("div", { class: "kombi-teile" }, ...k.teile.map(t => mini(t))),
    k.extras.length ? el("div", { class: "note" }, "Dazu passt auch:") : null,
    k.extras.length ? el("div", { class: "kombi-teile" }, ...k.extras.map(t => mini(t, true))) : null,
    el("p", { class: "hint" }, k.warum),
    k.luecken.length ? el("p", { class: "hint" }, `Hier fehlen noch: ${k.luecken.join(", ")}.`) : null,
    // Kein vorhandenes Teil passt wirklich: lieber eine Kaufidee als irgendetwas dazulegen
    k.ideen?.length ? el("p", { class: "hint" }, `🛍 Würde gut dazu passen: ${k.ideen.join(", ")}.`) : null,
    k.tipps.length ? el("ul", { class: "tipps" }, ...k.tipps.map(x => el("li", {}, x))) : null,
    el("div", { class: "actions wrap" }, speichernKnopf([...k.teile, ...k.extras], name,
      [k.warum, k.ideen?.length ? `Würde gut dazu passen: ${k.ideen.join(", ")}.` : null, ...k.tipps.map(x => "• " + x)].filter(Boolean).join("\n"), "app"), paketKnopf),
    paketBox);
}

export function renderPasst(box, kopf, items, folders, stil, nr, bild, oeffnen, neuZeichnen) {
  const anker = items.find(t => t.nr === nr);
  if (!anker) return false;
  const { ordnerWahl, stilWahl, pool, mitStil } = auswahlFelder(items, folders, stil, neuZeichnen);
  // Kaufideen rechnen immer mit dem ganzen Schrank: Was nur gerade abgewählt ist, fehlt ja nicht wirklich.
  const r = kombinationen(anker, pool, mitStil), ideen = kaufideen(anker, kandidaten(items), mitStil);

  fill(box, kopf,
    el("div", { class: "panel" }, ordnerWahl, stilWahl),
    anker.nichtAnziehen ? el("p", { class: "hint" }, "Dieses Teil ist als „🚫 Ziehe ich nicht an“ markiert. Es kommt sonst in keinen Vorschlag.") : null,
    mitInfo(el("h2", {}, "Vorschläge der App"), "Diese Vorschläge kommen aus festen Grundregeln der App (Farben, Schick-Stufe, Saison). Trends und kreativere Ideen gibt es über ChatGPT oder Gemini, ganz unten."),
    !r.kombis.length && pool.length < kandidaten(items).length ? el("p", { class: "hint" }, "Mit dieser Ordner-Auswahl findet die App nichts Passendes. Hake weitere Ordner an.")
      : r.hinweis ? el("p", { class: "hint" }, r.hinweis) : null,
    ...r.kombis.map((k, i) => kombiKarte(k, `Kombination ${i + 1}`, bild, oeffnen, `Mit Nr. ${nrText(anker.nr)} – ${beschreibung(anker)}`)),
    r.anders ? kombiKarte(r.anders, "✨ Mal was anderes", bild, oeffnen, `Mit Nr. ${nrText(anker.nr)}, mal anders`) : null,
    ideen.length ? el("div", { class: "panel" }, el("strong", {}, "🛍 Könnte noch fehlen"),
      el("ul", { class: "tipps" }, ...ideen.map(x => el("li", {}, el("strong", {}, x.was), ": ", x.warum)))) : null,
    chatgptPanel(items, stil, { teil: anker }, t => miniKachel(t, bild, oeffnen)));
  return true;
}
