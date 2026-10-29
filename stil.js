// Etappe 1f: „Mein Stil“ – was sie gern trägt und was lieber nicht.
// Die App erkennt bewusst NICHT die Figur; sie fragt freundlich nach Vorlieben. Wortwahl neutral, nie „Problemzonen“.
// Vorlieben, keine Verbote: Die Vorschläge sortieren danach, lassen aber nichts weg (hartes „Nie“ nur 🚫 am Teil).
// Wird sofort gespeichert, bleibt nur auf dem Gerät (und später in ihrer eigenen Sicherung).
import { el, fill, toast, choice, field, cleanText, names, FARB_NAMEN, STILRICHTUNGEN, HOSENSCHNITTE, MERKMALE } from "./ui.js?v=7";
import { setStil } from "./speicher.js?v=7";
import { GROUPS, PATTERNS, SLEEVES } from "./ki.js?v=4";

// Abschnitte mit Fragen. Bei jeder Frage beliebig viele Knöpfe (nichts angetippt = egal) und „Andere …“ zum Eintippen.
// Wo es dasselbe Merkmal auch am Teil gibt, stehen hier dieselben Wörter und dieselbe Liste für eigene Einträge (liste),
// damit die Vorschläge Vorlieben und Teile direkt vergleichen können. Ohne liste: eigene Liste „Stil: <Frage>“.
// nur: bei welcher Einstellung „Kombinationen für“ die Frage erscheint (fehlt = immer)
const DB = ["Damen", "beides"];
const SCHUHE = GROUPS.find(([g]) => g === "Schuhe")[1].map(([n]) => n);
export const STIL_ABSCHNITTE = [
  { titel: "Stilrichtung", offen: true, fragen: [
    { k: "richtung", label: "Welcher Stil passt zu dir?", werte: STILRICHTUNGEN, liste: "Stil" },
    { k: "wichtig", label: "Wichtig ist mir", werte: ["bequem", "praktisch", "schick", "auffallen", "eher unauffällig", "warm genug", "wenig bügeln"], beispiel: "z. B. nachhaltig" }
  ] },
  { titel: "Passform", offen: true, fragen: [
    { k: "oben", label: "Oberteile", werte: MERKMALE.weite.werte, liste: "Weite" },
    { k: "unten", label: "Hosen", hinweis: "Schlag = auch Bootcut · mit Bündchen = z. B. Jogger", werte: HOSENSCHNITTE, beispiel: "z. B. Karottenschnitt" },
    { k: "taille", label: "Bund", werte: MERKMALE.bund.werte, liste: "Bund" },
    { k: "mitte", label: "Taille / Körpermitte", werte: ["gern betonen (Gürtel, tailliert)", "locker umspielen", "Oberteil gern reinstecken", "Oberteil lieber offen drüber"], beispiel: "z. B. Wickeloptik" }
  ] },
  { titel: "Schnitte und Längen", fragen: [
    { k: "bauchfrei", label: "Bauchfrei", werte: ["gern", "nur ein bisschen (kurz geschnitten)", "lieber nicht"], nur: DB, beispiel: "z. B. nur mit Jacke drüber" },
    { k: "ausschnitt", label: "Ausschnitt", werte: ["Rundhals", "V-Ausschnitt", "hochgeschlossen / Rollkragen", "Hemdkragen", "eckig", "schulterfrei", "tiefer Ausschnitt"], beispiel: "z. B. Carmen-Ausschnitt" },
    // Liste heißt noch wie in 0.6.1 („Arme“), damit schon eingetippte Einträge bleiben
    { k: "aermel", label: "Ärmel", werte: names(SLEEVES), liste: "Stil: Arme", beispiel: "z. B. Puffärmel" },
    { k: "beine", label: "Beine", werte: ["gern zeigen", "bis zum Knie", "lieber bedeckt"], beispiel: "z. B. nur im Sommer zeigen" },
    { k: "laenge", label: "Rock- und Kleidlänge", werte: MERKMALE.laengeUnten.werte, liste: "Länge Rock/Kleid", nur: DB }
  ] },
  { titel: "Farben und Muster", fragen: [
    { k: "farbstil", label: "Farben allgemein", werte: ["kräftig", "gedeckt / neutral", "pastell", "Ton in Ton", "Schwarz-Weiß", "bunt gemischt"], beispiel: "z. B. Erdtöne" },
    { k: "muster", label: "Muster", werte: ["Einfarbig", "dezente Muster", "auffällige Muster", ...names(PATTERNS).filter(n => n !== "Einfarbig")], liste: "Muster" }
  ] },
  { titel: "Schuhe und Schmuck", fragen: [
    { k: "schuhe", label: "Schuhe", hinweis: "Stiefel = auch Stiefeletten · Flache Schuhe = z. B. Ballerinas, Loafer", werte: SCHUHE, beispiel: "z. B. Clogs" },
    { k: "schmuck", label: "Schmuck", werte: ["Gold", "Silber", "Roségold", "gemischt", "wenig Schmuck", "gern auffällig"], beispiel: "z. B. Perlen" }
  ] }
];
const FRAGEN = STIL_ABSCHNITTE.flatMap(a => a.fragen);
export const MODI = ["Damen", "Herren", "beides"];
// Ältere Fassungen speicherten andere Wörter (0.6: nur ein Text pro Frage; 0.6.1: Wörter, die es am Teil anders gibt) → umschreiben
const liste = v => Array.isArray(v) ? v : v ? [v] : [];
const ALT = {
  "lieber locker": "locker", "gern figurnah": "figurnah", "lieber hohe Taille": "hohe Taille", "lieber normale Höhe": "normale Höhe",
  "gern betonen (z. B. mit Gürtel)": "gern betonen (Gürtel, tailliert)", "lieber locker umspielen": "locker umspielen",
  "gern kräftig": "kräftig", "lieber gedeckt": "gedeckt / neutral", "gern mit Absatz": "Absatzschuhe", "lieber flach": "Flache Schuhe",
  "Schlag / Bootcut": "Schlag", "Jogger / mit Bündchen": "mit Bündchen", "gern ärmellos": "ärmellos", "kurze Ärmel": "kurz", "lieber lange Ärmel": "lang",
  "lieber einfarbig": "Einfarbig", "gern auffällige Muster": "auffällige Muster", "Streifen": "Gestreift", "Karo": "Kariert", "Blumen": "Geblümt",
  "flache Schuhe": "Flache Schuhe", "Absatz": "Absatzschuhe", "Stiefel / Stiefeletten": "Stiefel", "Loafer": "Flache Schuhe" };
// „Mein Stil“ in der aktuellen Form: jede Frage als Liste, alte Wörter umgeschrieben, doppelte nur einmal
export function stilAktuell(s) {
  const n = { ...s };
  if (n.absatz) { n.schuhe = [...liste(n.schuhe), n.absatz]; delete n.absatz; }
  for (const f of FRAGEN) if (n[f.k] != null) n[f.k] = [...new Set(liste(n[f.k]).map(v => ALT[v] || v))];
  return n;
}
const passt = (f, mode) => !f.nur || !mode || f.nur.includes(mode);
const kuerzen = (t, n) => t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;

// Kurzfassung für die Startseite, z. B. „Damenmode · lässig, minimalistisch · Oberteile: locker“
export function stilKurz(s) {
  s = stilAktuell(s);
  const teile = [];
  if (s.mode) teile.push(s.mode === "beides" ? "Damen- und Herrenmode" : s.mode + "mode");
  for (const f of FRAGEN) if (liste(s[f.k]).length && passt(f, s.mode)) teile.push(`${f.k === "richtung" ? "" : f.label + ": "}${liste(s[f.k]).join(", ")}`);
  if (s.lieblingsfarben?.length) teile.push("mag " + s.lieblingsfarben.join(", "));
  if (s.nichtFarben?.length) teile.push("lieber nicht " + s.nichtFarben.join(", "));
  if (s.text) teile.push("„" + kuerzen(s.text.replace(/\s*\n\s*/g, " / "), 60) + "“");
  return teile;
}

export function renderStil(box, kopf, stil) {
  let s = stilAktuell(stil), timer = null, gemeldet = false;
  // Jede Änderung sofort speichern (Freitext kurz verzögert, damit nicht bei jedem Buchstaben).
  // Gemeldet wird nur das erste Mal, sonst käme bei jedem Tippen eine Meldung.
  async function speichern(neu, melden = true) {
    s = { ...s, ...neu, geaendert: new Date().toISOString() };
    try { await setStil(s); if (melden && !gemeldet) { toast("Gespeichert – ab jetzt automatisch"); gemeldet = true; } }
    catch (e) { toast("Speichern hat nicht geklappt: " + (e?.message || e)); }
  }
  const widgets = [];
  const fragen = FRAGEN.map(f => {
    const w = choice({ field: f.liste || "Stil: " + f.label, beispiel: f.beispiel, options: f.werte, selected: liste(s[f.k]), max: 0, onChange: sel => speichern({ [f.k]: sel }) });
    widgets.push(w);
    return { f, feld: field(f.label, f.hinweis || null, w.el) };
  });
  const feldVon = new Map(fragen.map(x => [x.f, x.feld]));
  const sichtbar = () => { for (const { f, feld } of fragen) feld.hidden = !passt(f, s.mode); };
  const modus = choice({ options: MODI, selected: s.mode ? [s.mode] : [], onChange: sel => { speichern({ mode: sel[0] || null }); sichtbar(); } });
  const farbe = (k, titel) => field(titel, null, choice({ options: FARB_NAMEN, selected: s[k] || [], max: 0, withSwatch: true,
    onChange: sel => speichern({ [k]: sel }) }).el);
  const text = el("textarea", { class: "notiz", maxLength: 300, rows: 3, value: s.text || "", "aria-label": "Sonst noch etwas",
    placeholder: "z. B. keine Rollkragen, mag es bequem, trage oft Blazer zur Jeans" });
  text.oninput = () => { clearTimeout(timer); timer = setTimeout(() => speichern({ text: cleanText(text.value) || null }, false), 600); };
  text.onblur = () => { clearTimeout(timer); speichern({ text: cleanText(text.value) || null }, false); };
  sichtbar();
  // Alles auf „egal“ zurück (nach Rückfrage). Selbst eingetippte Knöpfe bleiben, sie lassen sich über „Andere …“ löschen.
  const zuruecksetzen = el("button", { type: "button", class: "btn" }, "Alles zurücksetzen");
  zuruecksetzen.onclick = async () => {
    if (!confirm("Alle Angaben in „Mein Stil“ zurücksetzen?\n\nDanach ist nichts mehr angetippt und das Textfeld leer. Deine Kleidung bleibt, wie sie ist.")) return;
    clearTimeout(timer);
    const leer = { geaendert: new Date().toISOString() };
    try { await setStil(leer); toast("Mein Stil ist zurückgesetzt"); renderStil(box, kopf, leer); }
    catch (e) { toast("Zurücksetzen hat nicht geklappt: " + (e?.message || e)); }
  };
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
    el("p", { class: "hint" }, "Wird sofort gespeichert und bleibt nur auf diesem Handy. Später kommt es mit in deine Sicherung. An ChatGPT geht es nur, wenn du die Anweisung selbst kopierst und „Meinen Stil mitschicken“ angehakt lässt."),
    el("div", { class: "actions" }, zuruecksetzen));
}
