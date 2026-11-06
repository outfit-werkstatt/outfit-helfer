// „🏷 Für Vinted“ (seit 0.22, Wunsch 06.11.2026): ein Teil zum Verkaufen vorbereiten.
// Vinted hat keine offene Schnittstelle und keinen Link zum Vorausfüllen (die Schnittstelle gibt es nur für ausgewählte Firmen,
// automatisches Ausfüllen verbieten die Nutzungsbedingungen; Recherche 06.11.2026). Darum macht die App wie beim Chat alles zum
// Kopieren fertig: Foto sichern, Titel und Beschreibung kopieren, in der Vinted-App einfügen. Die App schickt selbst nichts weg.
// Aufbau nach Verkaufs-Ratgebern: Titel = Marke + Art + Farbe + Detail + Größe (Suchwörter, kurz, ohne Emojis);
// Beschreibung = Aufhänger, Details (Marke, Größe, Farbe, Material, Passform, Zustand), Service. Nur ihre eigenen Angaben,
// nichts dazuerfunden. Die Notiz kommt nicht hinein (die ist privat). Texte nur als Text (value/textContent).
import { el, fill, toast, fehlerToast, field, choice, mitInfo, markenFeld, merkeMarken, VINTED_MERKMALE, ZUSTAENDE, groupOf } from "./ui.js?v=18";
import { updateItem, getPhoto, nrText } from "./speicher.js?v=10";
import { kopieren, vonHand, bilderWeitergeben, mobil } from "./chatgpt.js?v=14";

// Länge des Titels: laut einem Ratgeber erlaubt Vinted etwa 50 Zeichen (nicht offiziell bestätigt) → lieber kürzer
const TITEL_MAX = 50;
// Pro Sitzung gemerkt: mit Emojis und welche Formulierung
let mitEmojis = true, variante = 0;

/* ---------- Texte ---------- */
// Geschlecht der Art für „Schöner Pullover / Schöne Bluse / Schönes Kleid / Schöne Sneaker“ (p = Mehrzahl).
// Eigene Arten kennt die Liste nicht, dann ein Satz ohne Artikel.
const GENUS = { "T-Shirt": "n", Poloshirt: "n", Langarmshirt: "n", Top: "n", Bluse: "f", Hemd: "n", Body: "m", Pullover: "m", "Sweatshirt / Hoodie": "n",
  Strickjacke: "f", Weste: "f", Blazer: "m", Jacke: "f", Mantel: "m", Jeans: "f", Hose: "f", Leggings: "p", Jogginghose: "f", Shorts: "p", Rock: "m",
  Kleid: "n", Jumpsuit: "m", Sneaker: "p", Stiefel: "p", Absatzschuhe: "p", "Flache Schuhe": "p", Sandalen: "p", Tasche: "f", Rucksack: "m",
  Halskette: "f", Ohrringe: "p", Armband: "n", Ring: "m", Uhr: "f", Haarschmuck: "m", Gürtel: "m", "Schal / Tuch": "m", "Hut / Mütze": "m",
  Sonnenbrille: "f", Handschuhe: "p", Strumpfhose: "f", "Bikini / Badeanzug": "m" };
// [Schön…, mein…, Dies…, Verb]
const FORM = { m: ["Schöner", "meinen", "Dieser", "sucht"], f: ["Schöne", "meine", "Diese", "sucht"], n: ["Schönes", "mein", "Dieses", "sucht"], p: ["Schöne", "meine", "Diese", "suchen"] };
const MAT_KURZ = { "Seide / Satin": "Satin", "Strick / Wolle": "Strick", "Denim / Jeansstoff": "Denim", "Kunstfell / Teddy": "Teddy", "Synthetik, glänzend": "", Metall: "" };
const ZUSTAND_SATZ = {
  "Neu mit Etikett": "Neu und ungetragen, das Etikett hängt noch dran.",
  "Neu ohne Etikett": "Neu und ungetragen, nur ohne Etikett.",
  "Sehr gut": "In sehr gutem Zustand, kaum getragen.",
  "Gut": "In gutem Zustand, mit leichten Gebrauchsspuren.",
  "Zufriedenstellend": "Getragen, mit sichtbaren Gebrauchsspuren (siehe Fotos)."
};
const SAISON_WORT = { Sommer: "den Sommer", "Übergang": "die Übergangszeit", Winter: "den Winter" };
// Passform in Worten; „normal“ sagt nichts und fällt weg, eigene Einträge bleiben, wie sie sind
const PASSFORM = { normal: null, "normale Höhe": null, kurz: "kurz geschnitten", lang: "lang geschnitten", mini: "Mini", midi: "Midi", maxi: "Maxi",
  eng: "enges Bein", gerade: "gerades Bein", weit: "weites Bein", Schlag: "Schlag (ausgestellt)" };
const AERMEL = { "ärmellos": "ärmellos", kurz: "kurze Ärmel", "¾": "¾-Ärmel", lang: "lange Ärmel" };
const BUNT = "Bunt / mehrfarbig";

const artText = a => String(a || "").replace(/\s*\/\s*/g, "/");
// „Unbekannt“, „keine Marke“, „No Name“ … sind keine Marke (iPhone-Test 06.11.2026: „Unbekannt Poloshirt …“, „von Unbekannt“).
// Gespeichert bleibt, was sie eingetippt hat; nur Titel und Beschreibung lassen es weg, und es gilt nicht als „fehlt noch“.
const KEINE_MARKE = /^(unbekannt|keine marke|ohne marke|keine angabe|no ?name|unknown|sonstige|-+|–|\?+)$/i;
const ohneMarke = m => !m || KEINE_MARKE.test(String(m).trim());
const markeVon = t => ohneMarke(t.marke) ? null : t.marke;
const und = l => l.length < 2 ? l.join("") : l.slice(0, -1).join(", ") + " und " + l[l.length - 1];
const wort = (map, v) => v == null ? null : v in map ? map[v] : v;

// Titel: Marke + Art + Farbe + Material + Größe; wird es zu lang, fallen erst Material, dann die zweite Farbe, dann die Farbe weg.
// Die Größe bleibt immer ganz (wird nie abgeschnitten).
export function titelText(t) {
  const farben = (t.farben || []).map(f => f === BUNT ? "bunt" : f.toLowerCase());
  let mat = t.material ? wort(MAT_KURZ, t.material) : "";
  if (t.art === "Jeans" && mat === "Denim") mat = ""; // „Jeans Denim“ sagt dasselbe zweimal
  const gr = t.groesse ? `Gr. ${t.groesse}` : "";
  const marke = markeVon(t);
  const bau = (fb, m) => [marke, artText(t.art), fb.join("/"), m, gr].filter(Boolean).join(" ");
  for (const [fb, m] of [[farben, mat], [farben, ""], [farben.slice(0, 1), ""], [[], ""]]) { const s = bau(fb, m); if (s.length <= TITEL_MAX) return s; }
  const vorne = [marke, artText(t.art)].filter(Boolean).join(" ").slice(0, TITEL_MAX - (gr ? gr.length + 1 : 0)).trim();
  return [vorne, gr].filter(Boolean).join(" ");
}

// Beschreibung: Aufhänger, ein, zwei Sätze, Details, Service. v = Formulierung 0–2
export function beschreibungText(t, emojis = true, v = 0) {
  const em = s => emojis ? " " + s : "."; // ohne Emojis endet der erste Satz mit einem Punkt
  const marke = markeVon(t), g = GENUS[t.art], art = artText(t.art), von = marke ? ` von ${marke}` : "";
  const farben = t.farben || [], fa = !farben.length ? "" : farben.includes(BUNT) ? " in bunten Farben" : " in " + und(farben);
  const intro = g
    ? [`${FORM[g][0]} ${art}${von}${fa}${em("✨")}`, `Ich verkaufe ${FORM[g][1]} ${art}${von}${fa}${em("💕")}`,
       `${FORM[g][2]} ${art}${von}${fa} ${FORM[g][3]} ein neues Zuhause${em("🏡")}`][v % 3]
    : [`${art}${von}${fa}${em("✨")}`, `Ich verkaufe: ${art}${von}${fa}${em("💕")}`, `Zu verkaufen: ${art}${von}${fa}${em("🏡")}`][v % 3];
  const saison = t.saison || [];
  const saisonSatz = saison.includes("ganzjährig") ? "Das ganze Jahr über schön zu tragen."
    : saison.length ? `Perfekt für ${und(saison.map(s => SAISON_WORT[s]).filter(Boolean))}.` : null;
  const saetze = [ZUSTAND_SATZ[t.zustand], saisonSatz].filter(Boolean).join(" ");
  const passform = [wort(PASSFORM, t.weite), wort(PASSFORM, t.laenge), wort(AERMEL, t.aermel), wort(PASSFORM, t.schnitt), wort(PASSFORM, t.bund)].filter(Boolean);
  const details = [
    ["🏷", "Marke", marke], ["📏", "Größe", t.groesse], ["🎨", "Farbe", farben.join(", ")], ["🧵", "Material", t.material],
    ["🔸", "Muster", t.muster && t.muster !== "Einfarbig" ? t.muster : null], ["✂️", "Passform", passform.join(", ")],
    ["💫", "Stil", (t.stil || []).join(", ")], ["✨", "Zustand", t.zustand]
  ].filter(([, , w]) => w).map(([e, k, w]) => `${emojis ? e : "•"} ${k}: ${w}`);
  const service = emojis
    ? ["📐 Maße gern auf Anfrage.", "💬 Bei Fragen schreib mir gern!", "👀 Schau auch gern in meine anderen Artikel."].join("\n")
    : "Maße gern auf Anfrage. Bei Fragen schreib mir gern! Schau auch gern in meine anderen Artikel.";
  return [intro + (saetze ? "\n" + saetze : ""), details.join("\n"), service].filter(Boolean).join("\n\n");
}

/* ---------- Ansicht ---------- */
// t = das Teil, bild(blob) = Bild-Adresse (schrank.js gibt sie beim nächsten Zeichnen wieder frei)
export function renderVinted(box, kopf, t, bild) {
  let teil = { ...t };
  const g = teil.gruppe ?? groupOf(teil.art);
  const fehltBox = el("p", { class: "hint" });
  const titel = el("input", { type: "text", class: "feld-eingabe", maxLength: 100, autocomplete: "off", "aria-label": "Titel für Vinted" });
  const text = el("textarea", { class: "notiz", rows: 14, maxLength: 3000, "aria-label": "Beschreibung für Vinted" });
  const zaehler = el("div", { class: "note" });
  const zaehlen = () => { zaehler.textContent = `${titel.value.length} Zeichen` + (titel.value.length > TITEL_MAX ? " – bei Vinted evtl. zu lang" : ""); };
  titel.oninput = zaehlen;
  function erzeugen() {
    titel.value = titelText(teil); text.value = beschreibungText(teil, mitEmojis, variante); zaehlen();
    const fehlt = [!teil.marke && "Marke", groesseWahl && !teil.groesse && "Größe", !teil.zustand && "Zustand"].filter(Boolean);
    fehltBox.textContent = fehlt.length ? `Noch nicht angegeben: ${fehlt.join(", ")}. Damit findet man das Teil bei Vinted leichter.` : "";
    fehltBox.hidden = !fehlt.length;
  }
  // Angaben für Vinted: sofort am Teil gespeichert (dieselben wie unter „Mehr Angaben“), danach die Texte neu
  const speichere = async felder => {
    try { await updateItem(teil.nr, felder); teil = { ...teil, ...felder }; merkeMarken([teil]); erzeugen(); toast("Gespeichert"); }
    catch (e) { fehlerToast("Speichern hat nicht geklappt", e); }
  };
  const marke = markenFeld(teil.marke);
  marke.input.onchange = () => { if (marke.get() !== (teil.marke || null)) speichere({ marke: marke.get() }); };
  marke.input.onkeydown = e => { if (e.key === "Enter") marke.input.blur(); };
  const gk = ["groesseKleidung", "groesseSchuhe"].find(k => VINTED_MERKMALE[k].passt(teil.art, g));
  const groesseWahl = gk ? choice({ field: VINTED_MERKMALE[gk].feld, options: VINTED_MERKMALE[gk].werte, more: VINTED_MERKMALE[gk].more,
    selected: teil.groesse ? [teil.groesse] : [], onChange: sel => speichere({ groesse: sel[0] || null }) }) : null;
  const zustandWahl = choice({ options: ZUSTAENDE, selected: teil.zustand ? [teil.zustand] : [], onChange: sel => speichere({ zustand: sel[0] || null }) });
  box.dispose = () => groesseWahl?.dispose(); // eigene Größen-Knöpfe abmelden, wenn die Ansicht wechselt

  // Kopieren: muss direkt im Antippen laufen; klappt es nicht, Text zum Markieren zeigen
  const kopierBox = el("div", {});
  const kopierKnopf = (beschriftung, wert, fertig) => {
    const b = el("button", { type: "button", class: "btn primary" }, beschriftung);
    b.onclick = async () => { const v = wert(); if (!await kopieren(v)) { vonHand(kopierBox, v); return; } fill(kopierBox); toast(fertig); };
    return b;
  };
  const emojiWahl = choice({ options: ["Mit Emojis"], selected: mitEmojis ? ["Mit Emojis"] : [], onChange: sel => { mitEmojis = sel.length > 0; erzeugen(); } });
  const anders = el("button", { type: "button", class: "btn" }, "🔄 Andere Formulierung");
  anders.onclick = () => { variante = (variante + 1) % 3; erzeugen(); };

  // Foto: vorher laden, denn „Teilen“ braucht ein frisches Antippen ohne Warten dazwischen
  const vorschau = el("img", { class: "vinted-foto", src: bild(teil.vorschau), alt: "" });
  const fotoKnopf = el("button", { type: "button", class: "btn", disabled: true }, mobil() ? "🖼 Foto sichern / teilen" : "🖼 Foto herunterladen");
  let fotoDatei = null;
  getPhoto(teil.nr).then(b => b || teil.vorschau).then(b => {
    fotoDatei = new File([b], `${nrText(teil.nr)} - ${artText(teil.art).replace(/[^\p{L}\p{N} .,+&()'-]/gu, " ").trim() || "Teil"}.jpg`, { type: "image/jpeg" });
    fotoKnopf.disabled = false;
  }).catch(e => console.error(e));
  fotoKnopf.onclick = async () => { if (fotoDatei && await bilderWeitergeben([fotoDatei])) toast(mobil() ? "Jetzt Titel und Beschreibung kopieren" : "Heruntergeladen"); };

  erzeugen();
  fill(box, kopf,
    el("div", { class: "panel" },
      mitInfo(el("strong", {}, "So geht's"),
        "Vinted lässt keine fremde App Artikel einstellen. Darum macht die App alles zum Kopieren fertig, das Einstellen machst du selbst in der Vinted-App.",
        "In Vinted auf „Verkaufen“ tippen, das Foto aus deinen Fotos wählen, Titel und Beschreibung einfügen. Kategorie, Marke, Größe, Zustand und Preis wählst du dort selbst aus.",
        "Weitere Fotos (Etikett, Details, eventuelle Mängel) machst du am besten direkt in Vinted. Das Foto aus der App zeigt den Hintergrund (Boden, Zimmer), schau kurz drüber.",
        "Deine Notiz kommt nicht in den Text, die ist nur für dich. Titel und Beschreibung kannst du vor dem Kopieren ändern; tippst du danach oben etwas an, schreibt die App sie neu."),
      el("p", { class: "hint" }, "① Foto sichern ② Titel kopieren ③ Beschreibung kopieren ④ in der Vinted-App einfügen. Foto und Text lädst du selbst bei Vinted hoch."),
      el("div", { class: "vinted-kopf" }, vorschau, el("div", { class: "actions wrap" }, fotoKnopf))),
    el("div", { class: "panel" },
      el("strong", {}, "Angaben für Vinted"),
      el("p", { class: "hint" }, "Wird sofort am Teil gespeichert (dieselben Angaben wie unter „Angaben ändern“ → „Mehr Angaben“)."),
      field("Marke", null, marke.el),
      groesseWahl ? field("Größe", null, groesseWahl.el) : null,
      field("Zustand", null, zustandWahl.el),
      fehltBox),
    el("div", { class: "panel" },
      field("Titel", null, titel), zaehler,
      el("div", { class: "actions" }, kopierKnopf("📋 Titel kopieren", () => titel.value, "Titel kopiert – in Vinted einfügen")),
      field("Beschreibung", null, text),
      el("div", { class: "actions" }, kopierKnopf("📋 Beschreibung kopieren", () => text.value, "Beschreibung kopiert – in Vinted einfügen")),
      kopierBox,
      el("div", { class: "vinted-optionen" }, emojiWahl.el, anders)));
}
