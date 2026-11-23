// „🏷 Verkaufstext“ für Sachen im Haushalt (seit 0.32, Wunsch 19.11.2026): Titel und Beschreibung für Vinted, Kleinanzeigen oder eBay
// zum Kopieren, dazu das Foto zum Sichern. Wie „Für Vinted“ bei der Kleidung (vinted.js): Keine dieser Plattformen lässt eine fremde
// App Artikel einstellen, darum macht die App den Text fertig und sie stellt selbst ein. Nur ihre eigenen Angaben, nichts dazuerfunden;
// die Notiz kommt nicht hinein (die ist privat). Texte nur als Text (value/textContent).
import { el, fill, toast, fehlerToast, field, choice, mitInfo, markenFeld, merkeMarken, mobil, tabelle } from "./ui.js?v=21";
import { getDingFoto, dingNrText } from "./speicher.js?v=12";
import { kopieren, vonHand, bilderWeitergeben } from "./chatgpt.js?v=25";

// Titel-Längen: eBay erlaubt 80 Zeichen; bei Vinted und Kleinanzeigen nennen Ratgeber etwa 50 bzw. 65 (nicht offiziell bestätigt)
const TITEL_MAX = tabelle({ Vinted: 50, Kleinanzeigen: 65, eBay: 80 });
export const TEXT_PLATTFORMEN = ["Vinted", "Kleinanzeigen", "eBay"];
// Pro Sitzung gemerkt
let plattform = null, mitEmojis = null, variante = 0;

const ZUSTAND_SATZ = tabelle({
  "Neu, unbenutzt": "Neu und unbenutzt.",
  "Sehr gut": "In sehr gutem Zustand, kaum benutzt.",
  "Gut": "In gutem Zustand, mit leichten Gebrauchsspuren.",
  "Zufriedenstellend": "Gebraucht, mit sichtbaren Gebrauchsspuren (siehe Fotos).",
  "Defekt": "Defekt bzw. nicht voll funktionsfähig – für Bastler oder als Ersatzteil."
});
const ZUSTAND_TITEL = tabelle({ "Neu, unbenutzt": "neu", "Defekt": "defekt" });
const KEINE_MARKE = /^(unbekannt|keine marke|ohne marke|keine angabe|no ?name|unknown|sonstige|-+|–|\?+)$/i;
const markeVon = d => !d.marke || KEINE_MARKE.test(String(d.marke).trim()) ? null : d.marke;
const wasVon = d => d.name || d.kategorie || "Artikel";
// Eigene Felder je Art (seit 0.34, haushalt.js): Schlüssel → Wort. Kommen in den Text, die Notiz („Mehr Infos“) nicht.
export const DETAILS = tabelle({ autor: "Autor", titel: "Titel", kuenstler: "Künstler", album: "Album", motiv: "Motiv / Künstler", format: "Format", modell: "Modell",
  groesse: "Größe", masse: "Maße", material: "Material", alter: "Alter ab", vollstaendig: "Vollständig" });
const detail = (d, k) => typeof d.details?.[k] === "string" ? d.details[k] : null;
// Steht ein Wort schon im Namen (z. B. Modell oder Format), nicht noch einmal anhängen
const fehltIn = (was, w) => w && !was.toLowerCase().includes(w.toLowerCase()) ? w : null;

// Titel: Marke + Name + Modell + Format + Größe + Anzahl + „neu“/„defekt“; zu lang → hinten Wörter weglassen (nie mitten im Wort)
export function dingTitel(d, p) {
  const max = TITEL_MAX[p] || 50, marke = markeVon(d), was = wasVon(d);
  const teile = [fehltIn(was, marke), was, fehltIn(was, detail(d, "modell")), fehltIn(was, detail(d, "format")), fehltIn(was, detail(d, "groesse")), d.menge > 1 ? `${d.menge} Stück` : null, ZUSTAND_TITEL[d.zustand] || null].filter(Boolean);
  let s = teile.join(" ");
  while (s.length > max && s.includes(" ")) s = s.slice(0, s.lastIndexOf(" "));
  return s.slice(0, max);
}
// Beschreibung: Einstieg, Zustand, Einzelheiten, Versand/Privatverkauf je nach Plattform. v = Formulierung 0–2
export function dingBeschreibung(d, p, emojis, v = 0) {
  const marke = markeVon(d), was = wasVon(d), von = marke && !was.toLowerCase().includes(marke.toLowerCase()) ? ` von ${marke}` : "";
  const em = s => emojis ? " " + s : ".";
  const intro = [`Ich verkaufe: ${was}${von}${em("✨")}`, `Zu verkaufen: ${was}${von}${em("🏡")}`, `Biete hier ${was}${von} an${em("💕")}`][v % 3];
  const saetze = [ZUSTAND_SATZ[d.zustand], d.menge > 1 ? `Es sind ${d.menge} Stück.` : null].filter(Boolean).join(" ");
  const ZEICHEN = { autor: "✍️", titel: "📖", kuenstler: "🎤", album: "💿", motiv: "🖼", format: "📀", modell: "🔧", groesse: "📏", masse: "📐", material: "🪵", alter: "👶", vollstaendig: "🧩" };
  const details = [["🏷", "Marke", marke], ["📦", "Art", d.kategorie && d.kategorie !== was ? d.kategorie : null],
    ...Object.entries(DETAILS).map(([k, label]) => [ZEICHEN[k], label, detail(d, k)]), ["🔢", "Anzahl", d.menge > 1 ? `${d.menge} Stück` : null],
    ["✨", "Zustand", d.zustand]].filter(([, , w]) => w && w !== was).map(([e, k, w]) => `${emojis ? e : "•"} ${k}: ${w}`); // nicht doppelt: „Titel: Catan“, wenn es ohnehin so heißt
  const service = p === "Vinted"
    ? (emojis ? ["💬 Bei Fragen schreib mir gern!", "👀 Schau auch gern in meine anderen Artikel."] : ["Bei Fragen schreib mir gern!", "Schau auch gern in meine anderen Artikel."])
    : [p === "eBay" ? "Versand gegen Aufpreis oder Abholung möglich." : "Abholung oder Versand möglich (Versand gegen Aufpreis).",
       "Privatverkauf, daher keine Garantie und keine Rücknahme.", emojis ? "💬 Bei Fragen gern melden!" : "Bei Fragen gern melden."];
  return [intro + (saetze ? "\n" + saetze : ""), details.join("\n"), service.join("\n")].filter(Boolean).join("\n\n");
}

// d = das Ding, bild(blob) = Bild-Adresse, speichern(felder) = am Ding speichern, verkauf = Feld „Verkaufen“ (verkauf.js)
export function renderDingText(box, kopf, d, bild, speichern, verkauf) {
  let ding = { ...d };
  if (!plattform) plattform = TEXT_PLATTFORMEN.includes(d.plattform) ? d.plattform : "Vinted";
  const emojiAn = () => mitEmojis ?? plattform === "Vinted"; // Standard: nur bei Vinted mit Emojis
  const titel = el("input", { type: "text", class: "feld-eingabe", maxLength: 100, autocomplete: "off", "aria-label": "Titel" });
  const text = el("textarea", { class: "notiz", rows: 12, maxLength: 3000, "aria-label": "Beschreibung" });
  const zaehler = el("div", { class: "note" }), fehltBox = el("p", { class: "hint" });
  const zaehlen = () => { zaehler.textContent = `${titel.value.length} Zeichen` + (titel.value.length > TITEL_MAX[plattform] ? ` – bei ${plattform} evtl. zu lang` : ""); };
  titel.oninput = zaehlen;
  const emojiWahl = choice({ options: ["Mit Emojis"], selected: emojiAn() ? ["Mit Emojis"] : [], onChange: sel => { mitEmojis = sel.length > 0; erzeugen(); } });
  function erzeugen() {
    titel.value = dingTitel(ding, plattform); text.value = dingBeschreibung(ding, plattform, emojiAn(), variante); zaehlen();
    emojiWahl.set(emojiAn() ? ["Mit Emojis"] : []);
    const fehlt = [!ding.name && "Name", !ding.marke && "Marke", !ding.zustand && "Zustand"].filter(Boolean);
    fehltBox.textContent = fehlt.length ? `Noch nicht angegeben: ${fehlt.join(", ")}. Damit wird der Text genauer.` : "";
    fehltBox.hidden = !fehlt.length;
  }
  // Marke und Zustand gleich hier, sofort am Ding gespeichert (dieselben Angaben wie unter „Angaben ändern“)
  const speichere = async felder => {
    const vorher = ding;
    ding = { ...ding, ...felder }; erzeugen();
    try { await speichern(felder); merkeMarken([ding]); toast("Gespeichert"); }
    catch (e) { ding = vorher; erzeugen(); fehlerToast("Speichern hat nicht geklappt", e); }
  };
  const marke = markenFeld(ding.marke);
  const markeUebernehmen = () => { if (marke.get() !== (ding.marke || null)) speichere({ marke: marke.get() }); };
  marke.input.onchange = markeUebernehmen;
  marke.input.onkeydown = e => { if (e.key === "Enter") marke.input.blur(); };
  const zustandWahl = choice({ options: ["Neu, unbenutzt", "Sehr gut", "Gut", "Zufriedenstellend", "Defekt"], selected: ding.zustand ? [ding.zustand] : [],
    onChange: sel => speichere({ zustand: sel[0] || null }) });
  const plattformWahl = choice({ options: TEXT_PLATTFORMEN, selected: [plattform], onChange: sel => { if (sel[0]) { plattform = sel[0]; erzeugen(); } else plattformWahl.set([plattform]); } });

  const kopierBox = el("div", {});
  const kopierKnopf = (beschriftung, wert, fertig) => {
    const b = el("button", { type: "button", class: "btn primary" }, beschriftung);
    b.onclick = async () => { markeUebernehmen(); const v = wert(); if (!await kopieren(v)) { vonHand(kopierBox, v); return; } fill(kopierBox); toast(fertig()); };
    return b;
  };
  const anders = el("button", { type: "button", class: "btn" }, "🔄 Andere Formulierung");
  anders.onclick = () => { variante = (variante + 1) % 3; erzeugen(); };

  // Foto: vorher laden, denn „Teilen“ braucht ein frisches Antippen ohne Warten dazwischen
  const vorschau = el("img", { class: "vinted-foto", src: bild(ding.vorschau), alt: "" });
  const fotoKnopf = el("button", { type: "button", class: "btn", disabled: true }, mobil() ? "🖼 Foto sichern / teilen" : "🖼 Foto herunterladen");
  let fotoDatei = null;
  getDingFoto(ding.nr).then(b => b || ding.vorschau).then(b => {
    fotoDatei = new File([b], `${dingNrText(ding.nr)} - ${wasVon(ding).replace(/[^\p{L}\p{N} .,+&()'-]/gu, " ").trim() || "Ding"}.jpg`, { type: "image/jpeg" });
    fotoKnopf.disabled = false;
  }).catch(e => console.error(e));
  fotoKnopf.onclick = async () => { if (fotoDatei && await bilderWeitergeben([fotoDatei])) toast(mobil() ? "Jetzt Titel und Beschreibung kopieren" : "Heruntergeladen"); };

  erzeugen();
  fill(box, kopf,
    el("div", { class: "panel" },
      field("Für welche Plattform?", null, plattformWahl.el),
      mitInfo(el("strong", {}, "So geht's"),
        "Keine dieser Plattformen lässt eine fremde App Artikel einstellen. Darum macht die App alles zum Kopieren fertig, das Einstellen machst du selbst in der App der Plattform.",
        "Dort das Foto aus deinen Fotos wählen, Titel und Beschreibung einfügen. Kategorie, Preis und Versand wählst du dort selbst aus.",
        "Bei Kleinanzeigen und eBay steht „Privatverkauf, keine Garantie und keine Rücknahme“ dabei, wie es bei privaten Verkäufen üblich ist. Das ist keine Rechtsberatung.",
        "Deine Notiz kommt nicht in den Text, die ist nur für dich."),
      el("p", { class: "hint" }, "① Foto sichern ② Titel kopieren ③ Beschreibung kopieren ④ in der App der Plattform einfügen."),
      el("div", { class: "vinted-kopf" }, vorschau, el("div", { class: "actions wrap" }, fotoKnopf))),
    el("div", { class: "panel" },
      el("strong", {}, "Angaben"),
      el("p", { class: "hint" }, "Wird sofort gespeichert (dieselben Angaben wie unter „Angaben ändern“)."),
      field("Marke", null, marke.el), field("Zustand", null, zustandWahl.el), fehltBox),
    el("div", { class: "panel" },
      field("Titel", null, titel), zaehler,
      el("div", { class: "actions" }, kopierKnopf("📋 Titel kopieren", () => titel.value, () => `Titel kopiert – bei ${plattform} einfügen`)),
      field("Beschreibung", null, text),
      el("div", { class: "actions" }, kopierKnopf("📋 Beschreibung kopieren", () => text.value, () => `Beschreibung kopiert – bei ${plattform} einfügen`)),
      kopierBox,
      el("div", { class: "vinted-optionen" }, emojiWahl.el, anders)),
    el("div", { class: "panel" }, verkauf));
}
