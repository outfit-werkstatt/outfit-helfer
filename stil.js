// Etappe 1f: „Mein Stil“ – was sie gern trägt und was lieber nicht.
// Die App erkennt bewusst NICHT die Figur; sie fragt freundlich nach Vorlieben. Wortwahl neutral, nie „Problemzonen“.
// Wird sofort gespeichert, bleibt nur auf dem Gerät (und später in ihrer eigenen Sicherung).
// Genutzt von den Outfit-Regeln und (mit Häkchen „Meinen Stil mitschicken“) in der ChatGPT-Anweisung.
import { el, fill, toast, choice, field, clean, names } from "./ui.js?v=4";
import { getStil, setStil } from "./speicher.js?v=4";
import { COLORS } from "./ki.js?v=3";

// Jede Frage: ein Knopf oder keiner (nichts angetippt = egal). nur: bei welcher Einstellung „Kombinationen für“ sie erscheint.
export const STIL_FRAGEN = [
  { k: "oben", label: "Oberteile", werte: ["lieber locker", "gern figurnah"] },
  { k: "bauchfrei", label: "Bauchfrei", werte: ["gern", "lieber nicht"], nur: ["Damen", "beides"] },
  { k: "mitte", label: "Taille / Körpermitte", werte: ["gern betonen (z. B. mit Gürtel)", "lieber locker umspielen"] },
  { k: "beine", label: "Beine", werte: ["gern zeigen", "lieber bedeckt"] },
  { k: "taille", label: "Hosen und Röcke", werte: ["lieber hohe Taille", "lieber normale Höhe"] },
  { k: "absatz", label: "Schuhe", werte: ["gern mit Absatz", "lieber flach"], nur: ["Damen", "beides"] },
  { k: "farbstil", label: "Farben allgemein", werte: ["gern kräftig", "lieber gedeckt"] }
];
export const MODI = ["Damen", "Herren", "beides"];

// Kurzfassung für die Startseite, z. B. „Damenmode · Oberteile lieber locker · Bauchfrei lieber nicht“
export function stilKurz(s) {
  const teile = [];
  if (s.mode) teile.push(s.mode === "beides" ? "Damen- und Herrenmode" : s.mode + "mode");
  for (const f of STIL_FRAGEN) if (s[f.k] && (!f.nur || !s.mode || f.nur.includes(s.mode))) teile.push(`${f.label} ${s[f.k]}`);
  if (s.lieblingsfarben?.length) teile.push("mag " + s.lieblingsfarben.join(", "));
  if (s.nichtFarben?.length) teile.push("nicht " + s.nichtFarben.join(", "));
  if (s.text) teile.push("„" + s.text + "“");
  return teile;
}

export async function renderStil(box, kopf) {
  let s = await getStil();
  let timer = null;
  // Jede Änderung sofort speichern (Freitext kurz verzögert, damit nicht bei jedem Buchstaben)
  async function speichern(neu) {
    s = { ...s, ...neu, geaendert: new Date().toISOString() };
    try { await setStil(s); } catch (e) { toast("Speichern hat nicht geklappt: " + (e?.message || e)); }
  }
  const fragen = STIL_FRAGEN.map(f => {
    const w = choice({ options: f.werte, selected: s[f.k] ? [s[f.k]] : [], onChange: sel => { speichern({ [f.k]: sel[0] || null }); toast("Gespeichert"); } });
    return { f, feld: field(f.label, null, w.el) };
  });
  const sichtbar = () => { for (const { f, feld } of fragen) feld.hidden = !!f.nur && !!s.mode && !f.nur.includes(s.mode); };
  const modus = choice({ options: MODI, selected: s.mode ? [s.mode] : [], onChange: sel => { speichern({ mode: sel[0] || null }); sichtbar(); toast("Gespeichert"); } });
  const farbe = (k, titel) => field(titel, null, choice({ options: names(COLORS), selected: s[k] || [], max: 0, withSwatch: true,
    onChange: sel => { speichern({ [k]: sel }); toast("Gespeichert"); } }).el);
  const text = el("textarea", { class: "notiz", maxLength: 300, rows: 3, value: s.text || "", "aria-label": "Sonst noch etwas",
    placeholder: "z. B. keine Rollkragen, gern Gold-Schmuck, mag es bequem" });
  text.oninput = () => { clearTimeout(timer); timer = setTimeout(() => speichern({ text: clean(text.value) || null }), 600); };
  text.onblur = () => { clearTimeout(timer); speichern({ text: clean(text.value) || null }); };
  sichtbar();
  fill(box, kopf,
    el("div", { class: "panel" },
      field("Kombinationen für", "Bestimmt, welche Arten und Styling-Tipps die Vorschläge nutzen.", modus.el)),
    el("div", { class: "panel" },
      el("div", { class: "hint" }, "Was trägst du gern? Was lieber nicht? Nichts angetippt heißt: egal. Du kannst es jederzeit ändern."),
      ...fragen.map(x => x.feld)),
    el("details", { class: "panel mehr" }, el("summary", {}, "Farben (freiwillig)"),
      farbe("lieblingsfarben", "Farben, die ich gern trage"), farbe("nichtFarben", "Farben, die ich lieber nicht trage")),
    el("div", { class: "panel" }, field("Sonst noch etwas?", null, text)),
    el("p", { class: "hint" }, "Wird sofort gespeichert und bleibt nur auf diesem Handy. Später kommt es mit in deine Sicherung. An ChatGPT geht es nur, wenn du die Anweisung selbst kopierst und „Meinen Stil mitschicken“ angehakt lässt."));
}
