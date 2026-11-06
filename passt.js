// „Was passt dazu?“: ein Teil antippen → Kombinationen aus dem Kleiderschrank + schlichte Kaufideen (Entscheidung 6).
// Die Rechnung steht in regeln.js, hier nur die Anzeige. Texte immer per textContent/DOM, nie per innerHTML.
// Die Ordner-Auswahl und die Kombi-Karten nutzt auch „Outfit finden“ (outfit.js).
import { el, fill, field, choice, beschreibung } from "./ui.js?v=18";
import { nrText } from "./speicher.js?v=10";
import { stilAktuell } from "./stil.js?v=19";
import { kandidaten, kombinationen, kaufideen } from "./regeln.js?v=14";
import { chatgptPanel, bildPaketBereich } from "./chatgpt.js?v=12";
import { speichernKnopf } from "./fertig.js?v=6";

// Pro Sitzung gemerkt: abgewählte Ordner (neue Ordner sind damit automatisch angehakt) und der Schalter „Meinen Stil beachten“,
// dazu hier in „Was passt dazu?“, ob die Vorschläge der App und „Ordner und Mein Stil“ aufgeklappt sind
const OHNE_ORDNER = "Ohne Ordner";
// „Meinen Stil beachten“ ist seit 0.22 standardmäßig aus (Wunsch 06.11.2026), wie „Meinen Stil mitschicken“
let abgewaehlt = new Set(), ohneOrdnerAn = true, stilAn = false, appOffen = false, einstellOffen = false;

// Seit 0.17 (iPhone-Test 04.11.2026): Die Vorschläge der App stehen eingeklappt UNTER ChatGPT/Gemini. Die App kennt nur die
// Angaben, nicht die Fotos (z. B. fehlt fast immer das Material), darum passten sie oft nicht zum Anlass; der Chat sieht die Fotos.
// Ordner und „Mein Stil beachten“ wirken nur hier, darum stehen sie mit in der Klappe. offen/umschalten: Zustand, der das
// Neuzeichnen (bei jedem Tippen) überlebt. art = [Einzahl, Mehrzahl], z. B. ["Outfit", "Outfits"].
export function appKlappe({ anzahl, art, offen, umschalten, einstellungen, einstellOffen, einstellUmschalten }, ...inhalt) {
  const einstell = einstellungen.some(Boolean) ? el("details", { class: "mehr" }, el("summary", {}, "Ordner und „Mein Stil“"), ...einstellungen) : null;
  if (einstell) { einstell.open = einstellOffen; einstell.ontoggle = () => einstellUmschalten(einstell.open); }
  const d = el("details", { class: "klappe" },
    el("summary", {}, el("span", {}, "Vorschläge der App"), el("span", { class: "klappe-zahl" }, anzahl ? `${anzahl} ${anzahl === 1 ? art[0] : art[1]}` : "keine")),
    el("p", { class: "hint" }, "Sofort da, auch ohne Internet oder wenn der Chat für heute am Limit ist. Die App kennt aber nur die Angaben zu deinen Teilen, nicht die Fotos. Darum sind diese Vorschläge schlichter und passen nicht immer zum Anlass."),
    einstell, ...inhalt);
  d.open = offen;
  d.ontoggle = () => umschalten(d.open);
  return d;
}

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

  // Erst ChatGPT/Gemini (sieht die Fotos), darunter eingeklappt die Vorschläge der App
  fill(box, kopf,
    anker.nichtAnziehen ? el("p", { class: "hint" }, "Dieses Teil ist als „🚫 Ziehe ich nicht an“ markiert. Es kommt sonst in keinen Vorschlag.") : null,
    chatgptPanel(items, stil, { teil: anker }, t => miniKachel(t, bild, oeffnen)),
    appKlappe({ anzahl: r.kombis.length + (r.anders ? 1 : 0), art: ["Kombination", "Kombinationen"], offen: appOffen, umschalten: x => { appOffen = x; },
      einstellungen: [ordnerWahl, stilWahl], einstellOffen, einstellUmschalten: x => { einstellOffen = x; } },
      !r.kombis.length && pool.length < kandidaten(items).length ? el("p", { class: "hint" }, "Mit dieser Ordner-Auswahl findet die App nichts Passendes. Hake weitere Ordner an.")
        : r.hinweis ? el("p", { class: "hint" }, r.hinweis) : null,
      ...r.kombis.map((k, i) => kombiKarte(k, `Kombination ${i + 1}`, bild, oeffnen, `Mit Nr. ${nrText(anker.nr)} – ${beschreibung(anker)}`)),
      r.anders ? kombiKarte(r.anders, "✨ Mal was anderes", bild, oeffnen, `Mit Nr. ${nrText(anker.nr)}, mal anders`) : null,
      ideen.length ? el("div", { class: "panel" }, el("strong", {}, "🛍 Könnte noch fehlen"),
        el("ul", { class: "tipps" }, ...ideen.map(x => el("li", {}, el("strong", {}, x.was), ": ", x.warum)))) : null));
  return true;
}
