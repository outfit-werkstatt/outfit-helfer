// „💶 Verkäufe“ (seit 0.32, Wunsch 19.11.2026): eine Übersicht über alles, was sie verkauft – Kleidung und Haushalt zusammen.
// Erlös pro Jahr und Monat, pro Plattform, Kaufpreis gegen Erlös, was gerade online ist, und ein Hinweis vor den Meldegrenzen:
// Plattformen melden Verkäufer ans Bundeszentralamt für Steuern, sobald sie in einem Kalenderjahr auf EINER Plattform 30 Verkäufe
// oder 2.000 € erreichen (Plattformen-Steuertransparenzgesetz, EU-Richtlinie DAC7). Die Meldung allein heißt nicht, dass Steuern
// anfallen; private Gebrauchtverkäufe sind meist steuerfrei. Die App gibt keine Steuerberatung und zählt nur, was sie eingetragen hat.
// Texte nur per textContent/DOM (Namen und Plattformen können eingetippt sein).
import { el, fill, field, choice, mitInfo, beschreibung, datumText } from "./ui.js?v=21";
import { nrText } from "./speicher.js?v=12";
import { istVerkauft, imVerkauf, plattformVon, preisText, EINGESTELLT } from "./verkauf.js?v=5";
import { dingTitel } from "./haushalt.js?v=3";

const MELDE_ANZAHL = 30, MELDE_BETRAG = 2000, WARN_ANZAHL = 25, WARN_BETRAG = 1600;
const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const ALLE = "Alle Jahre";
let jahrWahl = null; // pro Sitzung gemerkt
const summe = l => Math.round(l.reduce((s, x) => s + (x.erloes || 0), 0) * 100) / 100;
const sachen = n => `${n} ${n === 1 ? "Sache" : "Sachen"}`;
// Jahr des Verkaufs in Ortszeit (seit 0.33.2, Durchsicht 19.11.2026: vorher aus der Weltzeit, ein Verkauf am 1.1. um 0:30 Uhr stand
// im Vorjahr, dort aber als „Januar“; der Monat kam schon aus der Ortszeit)
const jahrAus = iso => iso ? String(new Date(iso).getFullYear()) : null;

// Alle Teile und Dinge mit Verkaufs-Stand, einheitlich: { art, nr, titel, t }
function eintraege(items, dinge) {
  return [...items.filter(t => !t.geloescht && t.verkauf).map(t => ({ art: "teil", nr: t.nr, titel: `Nr. ${nrText(t.nr)} – ${beschreibung(t)}`, t })),
    ...dinge.filter(d => !d.geloescht && d.verkauf).map(d => ({ art: "ding", nr: d.nr, titel: dingTitel(d), t: d }))];
}
// Für die kleine Kachel auf der Startseite: null, wenn es nichts gibt
export function verkaeufeKurz(items, dinge) {
  const e = eintraege(items, dinge);
  if (!e.length) return null;
  const jahr = String(new Date().getFullYear());
  const dieses = e.filter(x => istVerkauft(x.t) && jahrAus(x.t.verkauftAm) === jahr);
  const online = e.filter(x => x.t.verkauf === EINGESTELLT).length;
  return dieses.length ? `${dieses.length} verkauft${summe(dieses.map(x => x.t)) ? " · " + preisText(summe(dieses.map(x => x.t))) : ""}` : online ? `${online} online` : `${e.length} zum Verkaufen`;
}

// oeffnen(eintrag) = Teil oder Ding ansehen, bild(blob) = Bild-Adresse
export function renderVerkaeufe(box, kopf, items, dinge, bild, oeffnen, neuZeichnen) {
  const alle = eintraege(items, dinge), verkauft = alle.filter(x => istVerkauft(x.t));
  const jahrVon = x => jahrAus(x.t.verkauftAm);
  const jahre = [...new Set(verkauft.map(jahrVon).filter(Boolean))].sort().reverse();
  const diesesJahr = String(new Date().getFullYear());
  if (!jahrWahl || (jahrWahl !== ALLE && !jahre.includes(jahrWahl))) jahrWahl = jahre.includes(diesesJahr) ? diesesJahr : jahre[0] || ALLE;
  const V = jahrWahl === ALLE ? verkauft : verkauft.filter(x => jahrVon(x) === jahrWahl);
  const T = V.map(x => x.t);

  // Jahr wählen
  const wahl = jahre.length > 1 || (jahre.length && verkauft.some(x => !jahrVon(x)))
    ? field("Jahr", null, choice({ options: [...jahre, ALLE], selected: [jahrWahl], onChange: sel => { jahrWahl = sel[0] || jahrWahl; neuZeichnen(); } }).el) : null;

  // Zahlen
  const mitBeiden = T.filter(t => t.erloes != null && t.kaufpreis != null);
  const gekauft = Math.round(mitBeiden.reduce((s, t) => s + t.kaufpreis, 0) * 100) / 100, zurueck = summe(mitBeiden);
  const zahlen = el("div", { class: "panel" },
    el("div", { class: "zahlen-reihe" },
      el("div", { class: "zahl-kachel" }, el("span", { class: "gross-zahl" }, String(V.length)), el("span", {}, "verkauft")),
      el("div", { class: "zahl-kachel" }, el("span", { class: "gross-zahl" }, preisText(summe(T)) || "0 €"), el("span", {}, "eingenommen"))),
    T.some(t => t.erloes == null) ? el("p", { class: "hint" }, `Bei ${sachen(T.filter(t => t.erloes == null).length)} ist kein Betrag eingetragen.`) : null,
    mitBeiden.length ? el("p", {}, `Bei ${sachen(mitBeiden.length)} mit Kaufpreis: gekauft für ${preisText(gekauft)}, verkauft für ${preisText(zurueck)}` +
      (gekauft > 0 ? ` – ${Math.round(100 * zurueck / gekauft)} % zurückbekommen.` : ".")) : null,
    !mitBeiden.length && V.length ? el("p", { class: "hint" }, "Trägst du beim verkauften Teil „Gekauft für“ ein, siehst du hier, wie viel du zurückbekommen hast.") : null);

  // Pro Plattform, dazu der Hinweis vor den Meldegrenzen (nur für das laufende Jahr)
  const proPlattform = new Map();
  for (const t of T) { const p = plattformVon(t), m = proPlattform.get(p) || []; m.push(t); proPlattform.set(p, m); }
  const plattformen = [...proPlattform].sort((a, b) => b[1].length - a[1].length);
  const plattformPanel = plattformen.length ? el("div", { class: "panel" }, el("strong", {}, "Nach Plattform"),
    el("div", { class: "verkauf-tabelle" }, ...plattformen.map(([p, l]) => el("div", { class: "verkauf-reihe" },
      el("span", {}, p), el("span", {}, sachen(l.length)), el("span", {}, preisText(summe(l)) || "–"))))) : null;
  let melde = null;
  if (jahrWahl === diesesJahr) {
    const nah = plattformen.filter(([, l]) => l.length >= WARN_ANZAHL || summe(l) >= WARN_BETRAG);
    if (nah.length) melde = el("div", { class: "panel hinweis" },
      mitInfo(el("strong", {}, "ℹ️ Meldegrenze für Verkaufsplattformen"),
        `Ab ${MELDE_ANZAHL} Verkäufen oder ab ${MELDE_BETRAG.toLocaleString("de-DE")} € in einem Kalenderjahr auf einer Plattform meldet diese Plattform deine Verkäufe ans Bundeszentralamt für Steuern.`,
        "Das heißt nicht, dass du Steuern zahlen musst: Wer eigene gebrauchte Sachen verkauft, macht meist keinen Gewinn. Wenn du unsicher bist, frag eine Steuerberatung. Die App gibt keine Steuerberatung.",
        "Die App zählt nur, was du hier als verkauft eingetragen hast."),
      ...nah.map(([p, l]) => el("p", {}, l.length >= MELDE_ANZAHL || summe(l) >= MELDE_BETRAG
        ? `${p}: ${sachen(l.length)}, ${preisText(summe(l)) || "0 €"} in diesem Jahr – die Grenze ist erreicht.`
        : `${p}: ${sachen(l.length)}, ${preisText(summe(l)) || "0 €"} in diesem Jahr – bald an der Grenze (${MELDE_ANZAHL} Verkäufe oder ${MELDE_BETRAG.toLocaleString("de-DE")} €).`)));
  }

  // Pro Monat (nur für ein Jahr)
  let monate = null;
  if (jahrWahl !== ALLE && V.length) {
    const proMonat = MONATE.map((name, i) => { const l = T.filter(t => t.verkauftAm && new Date(t.verkauftAm).getMonth() === i); return { name, l }; }).filter(m => m.l.length);
    const max = Math.max(...proMonat.map(m => m.l.length));
    monate = el("div", { class: "panel" }, el("strong", {}, "Nach Monat"),
      el("div", { class: "verkauf-tabelle" }, ...proMonat.map(m => {
        const balken = el("span", { class: "verkauf-balken" }); balken.style.width = Math.round(100 * m.l.length / max) + "%";
        return el("div", { class: "verkauf-reihe" }, el("span", {}, m.name), el("span", { class: "balken-platz" }, balken, el("span", {}, String(m.l.length))), el("span", {}, preisText(summe(m.l)) || "–"));
      })));
  }

  // Gerade online und „will ich verkaufen“ (unabhängig vom Jahr)
  const online = alle.filter(x => x.t.verkauf === EINGESTELLT), wollen = alle.filter(x => imVerkauf(x.t) && x.t.verkauf !== EINGESTELLT);
  const offenPreis = Math.round(online.reduce((s, x) => s + (x.t.preis || 0), 0) * 100) / 100;
  const jetzt = online.length || wollen.length ? el("div", { class: "panel" }, el("strong", {}, "Gerade"),
    online.length ? el("p", {}, `📦 ${sachen(online.length)} online${offenPreis ? `, zusammen ${preisText(offenPreis)}` : ""}.`) : null,
    wollen.length ? el("p", {}, `💰 ${sachen(wollen.length)} willst du noch einstellen.`) : null) : null;

  // Liste der verkauften Sachen, neueste zuerst
  const zeile = x => {
    const t = x.t, unter = [t.verkauftAm ? datumText(t.verkauftAm) : null, plattformVon(t), preisText(t.erloes) || null, t.kaufpreis != null ? `gekauft für ${preisText(t.kaufpreis)}` : null].filter(Boolean).join(" · ");
    return el("button", { type: "button", class: "verkauf-zeile", onclick: () => oeffnen(x) },
      el("img", { src: bild(t.vorschau), alt: "", loading: "lazy" }), el("span", {}, el("span", { class: "name" }, x.titel), el("span", { class: "unter" }, unter)));
  };
  const liste = V.length ? el("div", { class: "panel" }, el("strong", {}, jahrWahl === ALLE ? "Verkauft" : `Verkauft ${jahrWahl}`),
    ...[...V].sort((a, b) => (b.t.verkauftAm || "").localeCompare(a.t.verkauftAm || "")).map(zeile)) : null;

  fill(box, kopf, wahl,
    V.length ? zahlen : el("p", { class: "hint" }, verkauft.length ? "In diesem Jahr ist noch nichts verkauft." : "Noch nichts verkauft. Sobald du bei einem Teil oder Ding „✅ Verkauft“ antippst, steht es hier."),
    melde, plattformPanel, monate, jetzt, liste);
}
