// Etappe 1f: „Mein Stil“ – was sie gern trägt und was lieber nicht.
// Die App erkennt bewusst NICHT die Figur; sie fragt freundlich nach Vorlieben. Wortwahl neutral, nie „Problemzonen“.
// Vorlieben, keine Verbote: Die Vorschläge sortieren danach, lassen aber nichts weg (hartes „Nie“ nur 🚫 am Teil).
// Wird sofort gespeichert, bleibt nur auf dem Gerät (und später in ihrer eigenen Sicherung).
import { el, fill, toast, choice, field, clean, names } from "./ui.js?v=4";
import { getStil, setStil } from "./speicher.js?v=4";
import { COLORS } from "./ki.js?v=3";

// Abschnitte mit Fragen. Bei jeder Frage beliebig viele Knöpfe (nichts angetippt = egal) und „Andere …“ zum Eintippen.
// nur: bei welcher Einstellung „Kombinationen für“ die Frage erscheint (fehlt = immer)
const DB = ["Damen", "beides"];
export const STIL_ABSCHNITTE = [
  { titel: "Stilrichtung", offen: true, fragen: [
    { k: "richtung", label: "Welcher Stil passt zu dir?", werte: ["lässig", "sportlich", "klassisch", "elegant", "minimalistisch", "romantisch", "Boho", "Streetwear", "Business", "Vintage", "rockig", "Preppy"] },
    { k: "wichtig", label: "Wichtig ist mir", werte: ["bequem", "praktisch", "schick", "auffallen", "eher unauffällig", "warm genug", "wenig bügeln"] }
  ] },
  { titel: "Passform", offen: true, fragen: [
    { k: "oben", label: "Oberteile", werte: ["figurnah", "normal", "locker", "oversize"] },
    { k: "unten", label: "Hosen", werte: ["eng", "gerade", "weit", "Schlag / Bootcut", "Jogger / mit Bündchen"] },
    { k: "taille", label: "Bund", werte: ["hohe Taille", "normale Höhe", "tief sitzend"] },
    { k: "mitte", label: "Taille / Körpermitte", werte: ["gern betonen (Gürtel, tailliert)", "locker umspielen", "Oberteil gern reinstecken", "Oberteil lieber offen drüber"] }
  ] },
  { titel: "Schnitte und Längen", fragen: [
    { k: "bauchfrei", label: "Bauchfrei", werte: ["gern", "nur ein bisschen (kurz geschnitten)", "lieber nicht"], nur: DB },
    { k: "ausschnitt", label: "Ausschnitt", werte: ["Rundhals", "V-Ausschnitt", "hochgeschlossen / Rollkragen", "Hemdkragen", "eckig", "schulterfrei", "tiefer Ausschnitt"] },
    { k: "aermel", label: "Arme", werte: ["gern ärmellos", "kurze Ärmel", "lieber lange Ärmel"] },
    { k: "beine", label: "Beine", werte: ["gern zeigen", "bis zum Knie", "lieber bedeckt"] },
    { k: "laenge", label: "Rock- und Kleidlänge", werte: ["mini", "knielang", "midi", "maxi"], nur: DB }
  ] },
  { titel: "Farben und Muster", fragen: [
    { k: "farbstil", label: "Farben allgemein", werte: ["kräftig", "gedeckt / neutral", "pastell", "Ton in Ton", "Schwarz-Weiß", "bunt gemischt"] },
    { k: "muster", label: "Muster", werte: ["lieber einfarbig", "dezente Muster", "gern auffällige Muster", "Streifen", "Karo", "Blumen", "Animal-Print"] }
  ] },
  { titel: "Schuhe und Schmuck", fragen: [
    { k: "schuhe", label: "Schuhe", werte: ["Sneaker", "flache Schuhe", "Absatz", "Stiefel / Stiefeletten", "Sandalen", "Loafer"] },
    { k: "schmuck", label: "Schmuck", werte: ["Gold", "Silber", "Roségold", "gemischt", "wenig Schmuck", "gern auffällig"] }
  ] }
];
const FRAGEN = STIL_ABSCHNITTE.flatMap(a => a.fragen);
export const MODI = ["Damen", "Herren", "beides"];
// Ältere Fassung (0.6) speicherte bei einer Frage nur einen Text statt einer Liste, mit anderen Wörtern → umschreiben
const liste = v => Array.isArray(v) ? v : v ? [v] : [];
const ALT = { "lieber locker": "locker", "gern figurnah": "figurnah", "lieber hohe Taille": "hohe Taille", "lieber normale Höhe": "normale Höhe",
  "gern betonen (z. B. mit Gürtel)": "gern betonen (Gürtel, tailliert)", "lieber locker umspielen": "locker umspielen",
  "gern kräftig": "kräftig", "lieber gedeckt": "gedeckt / neutral", "gern mit Absatz": "Absatz", "lieber flach": "flache Schuhe" };
function aktuell(s) {
  const n = { ...s };
  for (const k of ["oben", "taille", "mitte", "farbstil", "bauchfrei", "beine"]) if (n[k] != null) n[k] = liste(n[k]).map(v => ALT[v] || v);
  if (n.absatz) { n.schuhe = [...new Set([...liste(n.schuhe), ALT[n.absatz] || n.absatz])]; delete n.absatz; }
  return n;
}
const passt = (f, mode) => !f.nur || !mode || f.nur.includes(mode);

// Kurzfassung für die Startseite, z. B. „Damenmode · lässig, minimalistisch · Oberteile: locker“
export function stilKurz(s) {
  s = aktuell(s);
  const teile = [];
  if (s.mode) teile.push(s.mode === "beides" ? "Damen- und Herrenmode" : s.mode + "mode");
  for (const f of FRAGEN) if (liste(s[f.k]).length && passt(f, s.mode)) teile.push(`${f.k === "richtung" ? "" : f.label + ": "}${liste(s[f.k]).join(", ")}`);
  if (s.lieblingsfarben?.length) teile.push("mag " + s.lieblingsfarben.join(", "));
  if (s.nichtFarben?.length) teile.push("lieber nicht " + s.nichtFarben.join(", "));
  if (s.text) teile.push("„" + s.text + "“");
  return teile;
}

export async function renderStil(box, kopf) {
  let s = aktuell(await getStil());
  let timer = null;
  // Jede Änderung sofort speichern (Freitext kurz verzögert, damit nicht bei jedem Buchstaben)
  async function speichern(neu, melden = true) {
    s = { ...s, ...neu, geaendert: new Date().toISOString() };
    try { await setStil(s); if (melden) toast("Gespeichert"); } catch (e) { toast("Speichern hat nicht geklappt: " + (e?.message || e)); }
  }
  const widgets = [];
  const fragen = FRAGEN.map(f => {
    // eigene Einträge je Frage in einer eigenen Liste („Stil: Ausschnitt“ usw.)
    const w = choice({ field: "Stil: " + f.label, options: f.werte, selected: liste(s[f.k]), max: 0, onChange: sel => speichern({ [f.k]: sel }) });
    widgets.push(w);
    return { f, feld: field(f.label, null, w.el) };
  });
  const feldVon = new Map(fragen.map(x => [x.f, x.feld]));
  const sichtbar = () => { for (const { f, feld } of fragen) feld.hidden = !passt(f, s.mode); };
  const modus = choice({ options: MODI, selected: s.mode ? [s.mode] : [], onChange: sel => { speichern({ mode: sel[0] || null }); sichtbar(); } });
  const farbe = (k, titel) => field(titel, null, choice({ options: names(COLORS), selected: s[k] || [], max: 0, withSwatch: true,
    onChange: sel => speichern({ [k]: sel }) }).el);
  const text = el("textarea", { class: "notiz", maxLength: 300, rows: 3, value: s.text || "", "aria-label": "Sonst noch etwas",
    placeholder: "z. B. keine Rollkragen, mag es bequem, trage oft Blazer zur Jeans" });
  text.oninput = () => { clearTimeout(timer); timer = setTimeout(() => speichern({ text: clean(text.value) || null }, false), 600); };
  text.onblur = () => { clearTimeout(timer); speichern({ text: clean(text.value) || null }, false); };
  sichtbar();
  // Beim Verlassen der Ansicht die Auswahl-Felder abmelden (sie hören sonst auf neue eigene Einträge)
  box.dispose?.(); box.dispose = () => widgets.forEach(w => w.dispose());
  fill(box, kopf,
    el("div", { class: "panel" },
      field("Kombinationen für", "Bestimmt, welche Arten und Styling-Tipps die Vorschläge nutzen.", modus.el)),
    el("p", { class: "hint" }, "Tippe an, was zu dir passt – auch mehreres. Nichts angetippt heißt: egal. Passt keine Antwort, nimm „Andere …“ und schreib es selbst. ",
      el("strong", {}, "Das sind Vorlieben, keine Verbote:"), " Passendes kommt in den Vorschlägen zuerst, aber nichts wird ganz weggelassen. Was du wirklich nie tragen willst, markierst du am Teil mit 🚫."),
    ...STIL_ABSCHNITTE.map(a => el("details", { class: "panel mehr", open: !!a.offen }, el("summary", {}, a.titel), ...a.fragen.map(f => feldVon.get(f)))),
    el("details", { class: "panel mehr" }, el("summary", {}, "Lieblingsfarben"),
      farbe("lieblingsfarben", "Farben, die ich gern trage"), farbe("nichtFarben", "Farben, die ich lieber nicht trage")),
    el("div", { class: "panel" }, field("Sonst noch etwas?", null, text)),
    el("p", { class: "hint" }, "Wird sofort gespeichert und bleibt nur auf diesem Handy. Später kommt es mit in deine Sicherung. An ChatGPT geht es nur, wenn du die Anweisung selbst kopierst und „Meinen Stil mitschicken“ angehakt lässt."));
}
