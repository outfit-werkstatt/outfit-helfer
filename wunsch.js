// „📝 Wunschliste – Brauche ich neu“ (seit 0.32, Wunsch 19.11.2026): Sachen, die sie kaufen möchte, zum Abhaken. Beim Eintragen
// schaut die App nach Wörtern, ob es so etwas schon gibt, im Haushalt und im Kleiderschrank („Hab ich sowas schon?“ ohne Foto;
// mit Foto kommt später, wenn die Erkennung für Haushaltsdinge gemessen ist).
// Gespeichert in meta „wunschliste“ [{ id, text, erledigt, erstellt }], kommt in die Sicherung. Texte nur per textContent/value.
import { el, fill, toast, fehlerToast, clean, beschreibung, mitInfo } from "./ui.js?v=21";
import { getMeta, setMeta, nrText, dingNrText } from "./speicher.js?v=12";

const MAX = 200, MAX_TEXT = 60, ID = /^w[a-z0-9]{1,40}$/;
let liste = null;
const neueId = () => "w" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const zeit = v => typeof v === "string" && v.length < 40 && !isNaN(Date.parse(v)) ? new Date(v).toISOString() : null;

// Auch für die Sicherung (zip-ansicht.js): nur bekannte Felder, Grenzen, Nummern eindeutig
export function wunschPruefen(v) {
  const ids = new Set();
  return (Array.isArray(v) ? v : []).slice(0, MAX).map(w => {
    const text = typeof w?.text === "string" ? clean(w.text).slice(0, MAX_TEXT) : "";
    let id = typeof w?.id === "string" && ID.test(w.id) ? w.id : neueId();
    while (ids.has(id)) id = neueId();
    ids.add(id);
    return text ? { id, text, erledigt: w.erledigt === true, erstellt: zeit(w?.erstellt) || new Date().toISOString() } : null;
  }).filter(Boolean);
}
export async function wunschLaden() {
  if (!liste) { try { liste = wunschPruefen(await getMeta("wunschliste")); } catch (e) { console.error(e); liste = []; } }
  return liste;
}
const speichern = () => { const jetzt = new Date().toISOString();
  return Promise.all([setMeta("wunschliste", liste), setMeta("sonstGeaendert", jetzt)]).catch(e => fehlerToast("Speichern hat nicht geklappt", e)); };

// „Hab ich sowas schon?“: Wörter ab 3 Buchstaben (ohne Füllwörter) im Namen, in der Art oder Marke
const FUELL = new Set(["ein", "eine", "einen", "neue", "neuer", "neues", "neuen", "für", "mit", "und", "oder", "von", "der", "die", "das", "den", "dem", "paar", "stück", "groß", "große", "kleine", "klein"]);
const woerter = s => String(s || "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 3 && !FUELL.has(w));
function treffer(text, items, dinge) {
  const such = woerter(text);
  if (!such.length) return [];
  const passt = ziel => { const z = woerter(ziel); return such.some(w => z.some(x => x.includes(w) || (x.length >= 4 && w.includes(x)))); };
  return [
    ...dinge.filter(d => !d.geloescht && d.verkauf !== "verkauft" && passt([d.name, d.kategorie, d.marke].join(" ")))
      .map(d => ({ art: "ding", nr: d.nr, text: `${dingNrText(d.nr)} – ${d.name || d.kategorie || "Ding"}`, vorschau: d.vorschau })),
    // Bei Kleidung nur Art und Marke, nicht die Farbe (sonst fand „Jeans“ auch alles in „jeansblau“)
    ...items.filter(t => !t.geloescht && t.verkauf !== "verkauft" && passt([t.art, t.marke].join(" ")))
      .map(t => ({ art: "teil", nr: t.nr, text: `Nr. ${nrText(t.nr)} – ${beschreibung(t)}`, vorschau: t.vorschau }))
  ].slice(0, 6);
}

// oeffnen({ art, nr }) = Ding oder Teil ansehen, bild(blob) = Bild-Adresse
export async function renderWunsch(box, kopf, items, dinge, bild, oeffnen, neuZeichnen) {
  await wunschLaden();
  const eingabe = el("input", { type: "text", class: "feld-eingabe", maxLength: MAX_TEXT, placeholder: "z. B. Wasserkocher, Winterjacke", autocomplete: "off", enterKeyHint: "done", "aria-label": "Was brauchst du?" });
  const vorschau = el("div", {});
  // Schon beim Tippen zeigen, ob es so etwas gibt (ohne neu zu zeichnen, sonst schlösse die Tastatur)
  const zeigeTreffer = (ziel, text) => {
    const t = treffer(text, items, dinge);
    fill(ziel, t.length ? el("div", { class: "wunsch-treffer" }, el("span", { class: "note" }, "Hast du schon:"),
      ...t.map(x => el("button", { type: "button", class: "chip", onclick: () => oeffnen(x) }, el("img", { src: bild(x.vorschau), alt: "" }), x.text))) : null);
  };
  eingabe.oninput = () => zeigeTreffer(vorschau, eingabe.value);
  const hinzu = el("button", { type: "button", class: "btn primary" }, "Hinzufügen");
  hinzu.onclick = () => {
    const text = clean(eingabe.value).slice(0, MAX_TEXT);
    if (!text) return toast("Bitte eintippen, was du brauchst.");
    if (liste.length >= MAX) return toast(`Höchstens ${MAX} Einträge. Lösch zuerst erledigte.`);
    liste = [{ id: neueId(), text, erledigt: false, erstellt: new Date().toISOString() }, ...liste];
    speichern(); neuZeichnen();
  };
  eingabe.onkeydown = e => { if (e.key === "Enter") hinzu.click(); };
  const zeile = w => {
    const box2 = el("input", { type: "checkbox", checked: w.erledigt, "aria-label": `${w.text} erledigt` });
    box2.onchange = () => { liste = liste.map(x => x.id === w.id ? { ...x, erledigt: box2.checked } : x); speichern(); if (box2.checked) toast("Abgehakt"); neuZeichnen(); };
    const weg = el("button", { type: "button", class: "link", "aria-label": `„${w.text}“ entfernen` }, "✕");
    weg.onclick = () => { liste = liste.filter(x => x.id !== w.id); speichern(); neuZeichnen(); };
    const unter = el("div", {});
    if (!w.erledigt) zeigeTreffer(unter, w.text);
    return el("div", { class: "wunsch-zeile" + (w.erledigt ? " erledigt" : "") },
      el("div", { class: "extra-zeile" }, el("label", {}, box2, el("span", {}, w.text)), weg), unter);
  };
  const offen = liste.filter(w => !w.erledigt), erledigt = liste.filter(w => w.erledigt);
  const leeren = el("button", { type: "button", class: "btn" }, "Erledigte löschen");
  leeren.onclick = () => { if (!confirm(`${erledigt.length} erledigte ${erledigt.length === 1 ? "Eintrag" : "Einträge"} löschen?`)) return; liste = offen; speichern(); neuZeichnen(); };
  const erledigtKlappe = erledigt.length ? el("details", { class: "klappe" }, el("summary", {}, el("span", {}, "Erledigt"), el("span", { class: "klappe-zahl" }, String(erledigt.length))),
    el("div", { class: "panel" }, ...erledigt.map(zeile), el("div", { class: "actions" }, leeren))) : null;
  fill(box, kopf,
    el("div", { class: "panel" },
      mitInfo(el("strong", {}, "Was brauchst du?"),
        "Schreib auf, was du kaufen möchtest. Die App schaut gleich, ob du so etwas schon hast – im Haushalt und im Kleiderschrank.",
        "Sie vergleicht nur die Wörter (z. B. „Wasserkocher“), keine Fotos. Hast du etwas gekauft, hak es ab."),
      el("div", { class: "extra-neu" }, eingabe, hinzu), vorschau),
    offen.length ? el("div", { class: "panel" }, el("strong", {}, `Noch zu kaufen (${offen.length})`), el("div", { class: "extra-liste" }, ...offen.map(zeile)))
      : el("p", { class: "hint" }, "Noch nichts auf der Liste."),
    erledigtKlappe);
}
