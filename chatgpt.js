// ChatGPT (Entscheidung 4, unterer Teil). Ablauf seit 0.12 nach Alis Vorstellung (03.11.2026): ChatGPT soll den GANZEN
// Kleiderschrank sehen, nicht nur Text. Seit 0.12.1 heißt es in der App „ChatGPT oder Gemini“: Ist ChatGPT am Limit,
// soll sie ausweichen können (Ali, 03.11.2026). Texte darum ohne Eigenheiten einer bestimmten KI.
// Das Bild vom Outfit ist eine eigene zweite Nachricht: Mit dem Bild-Wunsch in der Anfrage lieferte Gemini NUR ein Bild, keinen Text.
// 1. Einmal den Kleiderschrank an einen eigenen ChatGPT-Chat geben: Sammelbilder (JPG, je bis 28 Teile mit großer Nummer) plus
//    Text mit Nummer und Angaben. Warum Bilder und keine PDF oder ZIP: ChatGPT liest in PDFs (außer „Enterprise“) nur den Text und
//    sieht Fotos in einer ZIP nicht an; die kostenlose Version erlaubt nur etwa 3 Uploads pro Tag (Quellen in CLAUDE.md).
// 2. Später nur die Änderungen geben (neue oder geänderte Teile als Bild, entfernte als Text). Das spart Uploads.
// 3. Pro Situation oder Teil eine ausführliche Anfrage: worum es geht, alle angetippten Angaben, „Mein Stil“, der Auftrag
//    (Outfits nur aus ihren Teilen, Farben, Layering, Trends, Styling-Tipps, Kaufideen getrennt und nur als Text).
// 4. Antwort einfügen → die App zeigt die Outfits mit den eigenen Fotos.
// 5. Auf Wunsch Bild vom Outfit: Bild-Paket (die Teile groß) + Bild-Wunsch als eigene Nachricht.
// Die App schickt selbst nichts: Die Nutzerin lädt Bilder und Text selbst im Chat hoch (Hinweis auf OpenAI/Google steht dabei).
// Die eingefügte Antwort ist fremder Text: nur per textContent anzeigen, nur Nummern daraus übernehmen.
import { el, fill, choice, field, mitInfo, toast, beschreibung, cleanText, saisonVorschlag, wieVon, groupOf } from "./ui.js?v=15";
import { nrText, getMeta, setMeta, getPhoto } from "./speicher.js?v=10";
import { stilAktuell, stilZeilen } from "./stil.js?v=16";
import { kandidaten } from "./regeln.js?v=11";
import { GROUPS, GROUP_OF } from "./ki.js?v=7";
import { speichernKnopf } from "./fertig.js?v=3";

const MAX_ANTWORT = 20000;
// Pro Sitzung gemerkt (Ansichten werden bei jedem Tippen neu gezeichnet). Antwort und Zusatz getrennt je Frage,
// damit nichts in die falsche Ansicht wandert.
let stilMit = true, vorbereitet = null, vorschauUrls = [];
const merk = new Map(); // Schlüssel → { zusatz, antwort, angezeigt }
const merker = frage => { const k = frage.teil ? "teil:" + frage.teil.nr : "situation"; if (!merk.has(k)) merk.set(k, { zusatz: "", antwort: "", angezeigt: "", bildOutfit: "Outfit 1" }); return merk.get(k); };

/* ---------- Texte ---------- */
const datum = d => d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
const ohneUmbruch = s => s.replace(/\s*\n\s*/g, " / ");
const MODE_TEXT = { Damen: "Damenmode", Herren: "Herrenmode", beides: "Damen- und Herrenmode" };
// Eine Zeile pro Teil, z. B. „Nr. 012 – T-Shirt, braun; Material: Baumwolle; Ärmel: kurz; Saison: Sommer“.
// mitSaison = false für die Anweisung fürs Bild (dort zählen Material und Schnitt, die Saison nicht)
export function teilZeile(t, mitSaison = true) {
  const z = [`Nr. ${nrText(t.nr)} – ${beschreibung(t)}`];
  if (t.muster && t.muster !== "Einfarbig") z.push("Muster: " + t.muster);
  if (t.material) z.push("Material: " + t.material);
  for (const [k, n] of [["aermel", "Ärmel"], ["schnitt", "Hosenschnitt"], ["weite", "Weite"], ["laenge", "Länge"], ["bund", "Bund"]]) if (t[k]) z.push(`${n}: ${t[k]}`);
  if (t.stil?.length) z.push("Stil: " + t.stil.join(", "));
  if (mitSaison) z.push("Saison: " + (t.saison?.length ? t.saison : saisonVorschlag(t.art, t.gruppe, t.material)).join(", "));
  if (t.notiz) z.push("Notiz: " + ohneUmbruch(t.notiz));
  return z.join("; ");
}
// Reihenfolge wie in der App: nach Oberkategorie (Oberteile, Jacken, Unterteile …), darin nach Nummer
const GRUPPEN_REIHE = new Map(GROUPS.map(([g], i) => [g, i]));
const sortiert = teile => [...teile].sort((a, b) => ((GRUPPEN_REIHE.get(a.gruppe ?? groupOf(a.art)) ?? 99) - (GRUPPEN_REIHE.get(b.gruppe ?? groupOf(b.art)) ?? 99)) || a.nr - b.nr);
// Kurzer Fingerabdruck (FNV-1a) je Teil, um zu sehen, was sich seit dem letzten Mal geändert hat
const fingerabdruck = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); };
const standVon = teile => Object.fromEntries(teile.map(t => [t.nr, fingerabdruck(teilZeile(t))]));
// Was ist seit dem letzten Mal anders? (stand.teile = { Nr: Fingerabdruck }; Teile von vor 0.12 haben keinen Stand → „nie“)
function vergleich(teile, stand) {
  if (!stand?.teile) return { nie: true };
  const alt = stand.teile, jetzt = standVon(teile);
  const neu = teile.filter(t => alt[t.nr] !== jetzt[t.nr]); // neue und geänderte (z. B. Farbe korrigiert, oder Nummer neu vergeben)
  const weg = Object.keys(alt).map(Number).filter(n => !(n in jetzt)).sort((a, b) => a - b);
  return { neu, weg, zeit: stand.zeit, gleich: !neu.length && !weg.length };
}
function schrankText(teile, stil, anzahlBilder) {
  const s = stilAktuell(stil);
  return [
    "Hallo! In diesem Chat sollst du mir helfen, Outfits aus meinem eigenen Kleiderschrank zusammenzustellen – wie eine persönliche Stylistin.", "",
    `Auf den ${anzahlBilder === 1 ? "angehängten Bild" : `angehängten Bildern (${anzahlBilder} Stück)`} siehst du meine Kleidung, meinen Schmuck und meine Accessoires. Jedes Teil hat oben links eine feste Nummer. Unten steht dieselbe Liste als Text, mit den Angaben, die ich selbst eingetragen habe.`,
    anzahlBilder > 3 ? "Die kostenlose Version erlaubt mir nur wenige Uploads am Tag. Fehlen noch Bilder, schicke ich sie später nach." : null, "",
    "So machen wir es:",
    "- Ich schicke dir später einen Anlass mit Wetter oder ein Teil, das ich tragen möchte.",
    "- Dann stellst du Outfits nur aus diesen Teilen zusammen und nennst jedes Teil mit seiner Nummer.",
    "- Erfinde keine Nummern. Wenn du ein Teil auf den Bildern nicht gut erkennst, frag nach.",
    "- Schicke ich dir eine Änderung (neue Teile oder Teile, die weg sind), gilt ab dann der neue Stand.",
    MODE_TEXT[s.mode] ? `\nMode: ${MODE_TEXT[s.mode]}` : null, "",
    `Mein Kleiderschrank (Stand ${datum(new Date())}, ${teile.length} Teile):`, ...sortiert(teile).map(teilZeile), "",
    `Antworte jetzt bitte nur kurz mit „Verstanden, ${teile.length} Teile“.`
  ].filter(z => z !== null).join("\n");
}
function aenderungText(neu, weg) {
  return [`Änderung an meinem Kleiderschrank (Stand ${datum(new Date())}). Ab jetzt gilt:`,
    neu.length ? `\nNeu oder geändert (${neu.length > PRO_BILD ? "auf den angehängten Bildern" : "auf dem angehängten Bild"}):` : null, ...sortiert(neu).map(teilZeile),
    weg.length ? `\nNicht mehr da, bitte nicht mehr vorschlagen: ${weg.map(n => "Nr. " + nrText(n)).join(", ")}` : null,
    "", "Antworte bitte nur kurz mit „Verstanden“."].filter(z => z !== null).join("\n");
}
const temperaturText = t => t ? t.replace("°", " °C") : null;
function anfrageText(frage, freitext, stil) {
  const s = stilAktuell(stil), zeilen = stilMit ? stilZeilen(s) : [], q = frage.situation || {};
  const angaben = frage.teil ? [] : [["Anlass", q.anlass], ["Wie schick", q.schickWahl], ["Temperatur", temperaturText(q.temperatur)], ["Wetter", q.wetter?.join(", ")]].filter(([, v]) => v);
  const teil = frage.teil && `Nr. ${nrText(frage.teil.nr)} – ${beschreibung(frage.teil)}`;
  return [
    frage.teil ? `Hallo! Ich möchte ${teil} tragen und suche passende Kombinationen aus meinem Kleiderschrank (die Bilder und die Liste weiter oben in diesem Chat).`
      : "Hallo! Ich brauche ein Outfit aus meinem Kleiderschrank (die Bilder und die Liste weiter oben in diesem Chat).", "",
    "Worum es geht:",
    ...angaben.map(([k, v]) => `- ${k}: ${v}`),
    freitext ? `- Dazu: ${ohneUmbruch(freitext)}` : null,
    !frage.teil && !angaben.length && !freitext ? "- Ich habe nichts Besonderes angegeben: Schlag mir etwas Schönes für den Alltag vor." : null,
    frage.teil && !freitext ? "- Sonst nichts Besonderes, gern alltagstauglich." : null,
    MODE_TEXT[s.mode] ? `- Mode: ${MODE_TEXT[s.mode]}` : null,
    // Der Moment geht vor (seit 0.18): Mit Anlass oder „Wie schick“ sagt die Anfrage, dass „Mein Stil“ nur allgemeine Vorlieben sind
    zeilen.length ? (q.anlass || q.schickWahl
      ? "\nMein Stil (was ich allgemein mag – Anlass und „Wie schick“ oben gehen vor; Vorlieben, keine Verbote, schlag gern auch mal eine Alternative vor):"
      : "\nMein Stil (Vorlieben, keine Verbote – schlag gern auch mal eine Alternative vor):") : null, ...zeilen.map(z => "- " + z), "",
    "Bitte:",
    `1. ${frage.teil ? `Zeig mir bis zu 3 Kombinationen mit ${teil}` : "Stell mir bis zu 3 Outfits zusammen"}, nur aus meinen Teilen, so dass ich jedes Outfit genau so aus meinem Kleiderschrank anziehen kann. Nenne jedes Teil mit Nummer und kurzer Beschreibung (z. B. „Nr. 012 – T-Shirt, braun“) und schreib jedes als „Outfit 1“, „Outfit 2“ …`,
    "2. Nimm nur dazu, was wirklich passt: lieber keine Tasche und kein Schmuck als etwas Unpassendes.",
    "3. Erklär kurz, warum es passt: Farbkombination, Schnitte, Layering und was davon gerade im Trend ist.",
    "4. Gib konkrete Styling-Tipps (z. B. reinstecken, Ärmel krempeln, welcher Schmuck und welche Tasche aus meinem Kleiderschrank, Haare).",
    `5. ${frage.teil ? "Nenn höchstens 3 allgemeine Kaufideen, die gut dazu passen würden" : "Fehlt etwas Wichtiges, nenn höchstens 3 allgemeine Kaufideen"} (ohne Shops und ohne Links). Schreib sie getrennt unter die Überschrift „Kaufideen“ und nie in ein Outfit, z. B. „Mit einem camelfarbenen Gürtel würde Outfit 2 noch besser aussehen“.`, "",
    "Antworte bitte nur mit Text und erstelle noch kein Bild. Um ein Bild bitte ich dich danach extra."
  ].filter(z => z !== null).join("\n");
}
// Zweite Nachricht, erst nach der Antwort mit den Outfits. wovon = „Outfit 2 aus deiner Antwort“ o. Ä.;
// teile = die Teile auf dem Bild-Paket (ohne Paket verweist der Text auf die Sammelbilder). Der Text nennt die Teile selbst,
// damit er auch in einem neuen Chat funktioniert. traegt = „Ich“ (Foto der Person hängt dran) oder „Model“, pro Sitzung gemerkt.
const TRAEGT = { ich: "Ich (Foto anhängen)", model: "Ein Model" };
let traegt = TRAEGT.model;
// Die Teile mit Material und Schnitt (Gemini machte am 03.11.2026 aus der Lederhose eine Stoffhose und aus der eckigen
// Tasche einen Beutel, als nur „Hose, schwarz“ dastand).
const bildText = (wovon, teile = null) => [
  `Erstelle bitte ein realistisches Foto von ${wovon}${teile ? ":" : "."}`,
  ...(teile || []).map(t => "• " + teilZeile(t, false)),
  teile ? "- Angehängt ist das Bild-Paket: Darauf siehst du genau diese Teile groß, mit Nummer. Übernimm sie so genau wie möglich (Farbe, Schnitt, Länge, Muster, Material und Details wie Knöpfe, Aufdruck, Schnallen oder Zifferblatt). Material und Form nicht verändern: Leder bleibt Leder, eine eckige Tasche bleibt eckig, eine schmale Hose bleibt schmal und eine weite weit."
    : "- Zeig genau die Teile aus diesem Outfit, so wie sie auf meinen Sammelbildern aussehen (Farbe, Schnitt, Länge, Muster, Material).",
  traegt === TRAEGT.ich
    ? `- Angehängt ist außerdem ein Foto von mir${teile ? " (das andere Bild)" : ""}. Zeig genau diese Person in dem Outfit: gleiches Gesicht, gleiche Haare, gleiche Figur und Hautfarbe. Nichts an der Person verschönern oder verändern.`
    : "- Zeig das Outfit an einem Model.",
  "- Ganzer Körper von Kopf bis Fuß, natürliche Haltung, ruhiger Hintergrund, Tageslicht.",
  "- Zeig nur Teile aus meinem Kleiderschrank. Füg nichts dazu, was nicht im Outfit steht, auch keinen Schmuck, keine Tasche und keine Kaufidee.",
  "- Fehlt etwas (z. B. eine Jacke), lass es im Bild weg und schreib es nur als Text darunter: „Mit … würde es noch besser aussehen“.",
  "- Schreib unter das Bild, welche Nummern darauf zu sehen sind."
].join("\n");
// Knöpfe „Wer soll es tragen?“ (in Schritt 4 und bei den Vorschlägen der App)
const traegtWahl = () => field("Wer soll das Outfit tragen?", null,
  choice({ options: Object.values(TRAEGT), selected: [traegt], onChange: sel => { traegt = sel[0] || TRAEGT.model; } }).el,
  ["Bei „Ich“: Häng im Chat zusätzlich ein Foto von dir an, am besten ganzer Körper und gutes Licht. Das Foto geht an den Anbieter.",
    "Gratis sind nur wenige Bilder pro Tag möglich, und das Bild ist eine Vorschau, kein Spiegel: Farben, Muster und Details können abweichen."]);

/* ---------- Sammelbilder ---------- */
// Je Bild bis zu 28 Teile (4 Spalten × 7 Reihen). Weniger pro Bild wäre schärfer, bräuchte aber mehr der wenigen Uploads.
const PRO_BILD = 28, SPALTEN = 4, KACHEL = 400, TEXT_H = 64, KOPF_H = 84;
const kuerzen = (x, text, breite) => { if (x.measureText(text).width <= breite) return text; while (text.length > 1 && x.measureText(text + "…").width > breite) text = text.slice(0, -1); return text + "…"; };
async function sammelbilder(teile, titel) {
  const liste = sortiert(teile), anzahl = Math.max(1, Math.ceil(liste.length / PRO_BILD)), je = Math.ceil(liste.length / anzahl), dateien = [];
  for (let b = 0; b < anzahl; b++) {
    const stueck = liste.slice(b * je, (b + 1) * je), reihen = Math.ceil(stueck.length / SPALTEN);
    const c = document.createElement("canvas"); c.width = SPALTEN * KACHEL; c.height = KOPF_H + reihen * (KACHEL + TEXT_H);
    const x = c.getContext("2d");
    x.fillStyle = "#ffffff"; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = "#222222"; x.font = "bold 40px system-ui, -apple-system, sans-serif"; x.textBaseline = "alphabetic";
    x.fillText(kuerzen(x, `${titel} · Bild ${b + 1} von ${anzahl} · ${stueck.length} Teile`, c.width - 48), 24, 56);
    for (let i = 0; i < stueck.length; i++) {
      const t = stueck[i], cx = (i % SPALTEN) * KACHEL, cy = KOPF_H + Math.floor(i / SPALTEN) * (KACHEL + TEXT_H);
      x.fillStyle = "#ebebeb"; x.fillRect(cx + 8, cy + 8, KACHEL - 16, KACHEL - 16);
      try {
        const bm = await createImageBitmap(t.vorschau instanceof Blob ? t.vorschau : new Blob([t.vorschau], { type: "image/jpeg" }));
        const s = Math.min((KACHEL - 32) / bm.width, (KACHEL - 32) / bm.height), w = bm.width * s, h = bm.height * s;
        x.drawImage(bm, cx + (KACHEL - w) / 2, cy + (KACHEL - h) / 2, w, h); bm.close();
      } catch (e) { console.error(e); }
      // Große Nummer oben links, damit ChatGPT und sie dieselbe Nummer sehen (Entscheidung 7)
      x.fillStyle = "#111111";
      if (x.roundRect) { x.beginPath(); x.roundRect(cx + 16, cy + 16, 132, 66, 14); x.fill(); } else x.fillRect(cx + 16, cy + 16, 132, 66);
      x.fillStyle = "#ffffff"; x.font = "bold 48px system-ui, -apple-system, sans-serif"; x.fillText(nrText(t.nr), cx + 28, cy + 66);
      x.fillStyle = "#222222"; x.font = "28px system-ui, -apple-system, sans-serif";
      x.fillText(kuerzen(x, beschreibung(t), KACHEL - 32), cx + 16, cy + KACHEL + 40);
    }
    const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.85));
    c.width = c.height = 0; // Zeichenfläche freigeben (iOS begrenzt ihren Speicher)
    if (!blob) throw new Error("Das Bild konnte nicht erstellt werden.");
    dateien.push(new File([blob], `${titel} ${b + 1} von ${anzahl}.jpg`, { type: "image/jpeg" }));
  }
  return dateien;
}
/* ---------- Bild-Paket (Entscheidung 5) ---------- */
// Die Teile EINES Outfits groß, als ein JPG mit Nummern, zum Anhängen an den Bild-Wunsch. Aus den Originalfotos (1200 px,
// nicht ausgeschnitten: echte Farben und Details, Alis Idee 03.11.2026). Die Sammelbilder reichen dafür nicht: Die KI
// verkleinert jedes Bild, bei 28 Teilen bleiben pro Teil nur wenige Pixel (Gemini erfand eine Jacke, die Uhr sah anders aus).
const PAKET_MAX = 9, PAKET_BREITE = 1600, SCHRIFT = "system-ui, -apple-system, sans-serif";
async function bildPaket(teile) {
  const liste = teile.slice(0, PAKET_MAX), n = liste.length;
  const spalten = n <= 1 ? 1 : n <= 4 ? 2 : 3, kw = Math.round(PAKET_BREITE / spalten), kh = Math.round(kw * 4 / 3);
  const fs = Math.min(72, Math.round(kw * 0.08)), ts = Math.max(26, Math.round(fs * 0.6)), th = ts * 2, kopf = 90;
  const c = document.createElement("canvas"); c.width = spalten * kw; c.height = kopf + Math.ceil(n / spalten) * (kh + th);
  const x = c.getContext("2d");
  x.fillStyle = "#ffffff"; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = "#222222"; x.font = `bold 44px ${SCHRIFT}`; x.textBaseline = "alphabetic";
  x.fillText(kuerzen(x, "Outfit: " + liste.map(t => "Nr. " + nrText(t.nr)).join(" + "), c.width - 48), 24, 60);
  for (let i = 0; i < n; i++) {
    const t = liste[i], cx = (i % spalten) * kw, cy = kopf + Math.floor(i / spalten) * (kh + th);
    x.fillStyle = "#ebebeb"; x.fillRect(cx + 10, cy + 10, kw - 20, kh - 20);
    // Großes Foto; fehlt es (z. B. nicht lesbar), notfalls die Vorschau
    let quelle = null;
    try { quelle = await getPhoto(t.nr); } catch (e) { console.error(e); }
    if (!quelle && t.vorschau) quelle = t.vorschau instanceof Blob ? t.vorschau : new Blob([t.vorschau], { type: "image/jpeg" });
    if (quelle) try {
      const bm = await createImageBitmap(quelle);
      const s = Math.min((kw - 28) / bm.width, (kh - 28) / bm.height), w = bm.width * s, h = bm.height * s;
      x.imageSmoothingQuality = "high"; x.drawImage(bm, cx + (kw - w) / 2, cy + (kh - h) / 2, w, h); bm.close();
    } catch (e) { console.error(e); }
    // Nummer als Plakette oben links (Entscheidung 7)
    x.font = `bold ${fs}px ${SCHRIFT}`;
    const nr = nrText(t.nr), bw = x.measureText(nr).width + fs * 0.6, bh = fs * 1.35;
    x.fillStyle = "#111111";
    if (x.roundRect) { x.beginPath(); x.roundRect(cx + 20, cy + 20, bw, bh, fs * 0.25); x.fill(); } else x.fillRect(cx + 20, cy + 20, bw, bh);
    x.fillStyle = "#ffffff"; x.fillText(nr, cx + 20 + fs * 0.3, cy + 20 + bh * 0.74);
    x.fillStyle = "#222222"; x.font = `${ts}px ${SCHRIFT}`;
    x.fillText(kuerzen(x, `Nr. ${nr} – ${beschreibung(t)}`, kw - 32), cx + 16, cy + kh + Math.round(ts * 1.2));
  }
  const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.88));
  c.width = c.height = 0; // Zeichenfläche freigeben (iOS begrenzt ihren Speicher)
  if (!blob) throw new Error("Das Bild konnte nicht erstellt werden.");
  return new File([blob], `Bild-Paket ${liste.map(t => nrText(t.nr)).join(" + ")}.jpg`, { type: "image/jpeg" });
}
// Nur ein Bild-Paket gleichzeitig offen: Beim nächsten wird das vorige geschlossen und seine Bild-Adresse freigegeben.
// lauf zählt mit: Wird während des Erstellens schon das nächste angefordert (schnell zwei Outfits angetippt), verfällt das ältere.
let paketOffen = null, lauf = 0;
// Bild-Paket + Bild-Wunsch für ein Outfit (Schritt 4 und die Vorschläge der App). erstellen() muss nicht im Antippen
// laufen; „sichern / teilen“ und „kopieren“ sind eigene Knöpfe, weil Teilen und Zwischenablage ein frisches Tippen brauchen.
export function bildPaketBereich(alle, wovon) {
  const teile = sortiert(alle); // Oberteile, Jacken, Unterteile, Schuhe … wie im Kleiderschrank
  const box = el("div", { class: "bildpaket-box" }), knopf = el("button", { type: "button", class: "btn primary" });
  const bereit = () => { knopf.disabled = false; knopf.textContent = "🖼 Bild-Paket erstellen"; fill(box, knopf); };
  async function erstellen() {
    paketOffen?.zu();
    const meins = ++lauf;
    knopf.disabled = true; knopf.textContent = "Bild-Paket wird erstellt …";
    let datei;
    try { datei = await bildPaket(teile); } catch (e) { if (meins === lauf) toast("Hat nicht geklappt: " + (e?.message || e)); console.error(e); bereit(); return; }
    if (meins !== lauf) { bereit(); return; }
    const url = URL.createObjectURL(datei);
    const zu = () => { URL.revokeObjectURL(url); bereit(); if (paketOffen?.zu === zu) paketOffen = null; };
    paketOffen = { zu };
    const kopierBox = el("div", {});
    const teilen = el("button", { type: "button", class: "btn" }, mobil() ? "🖼 Bild-Paket sichern / teilen" : "🖼 Bild-Paket herunterladen");
    teilen.onclick = async () => { if (await bilderWeitergeben([datei])) toast("Jetzt die Anweisung fürs Bild kopieren"); };
    const wunsch = el("button", { type: "button", class: "btn primary" }, "📋 Anweisung fürs Bild kopieren");
    wunsch.onclick = async () => {
      const text = bildText(wovon, teile.slice(0, PAKET_MAX));
      if (!await kopieren(text)) { vonHand(kopierBox, text); return; }
      fill(kopierBox); toast("Anweisung kopiert – mit den Bildern im Chat senden");
    };
    fill(box, el("img", { src: url, alt: "Bild-Paket: " + teile.map(t => "Nr. " + nrText(t.nr)).join(" + "), class: "bildpaket" }),
      teile.length > PAKET_MAX ? el("p", { class: "hint" }, `Im Bild-Paket sind die ersten ${PAKET_MAX} Teile.`) : null,
      traegtWahl(),
      mitInfo(el("p", { class: "hint" }, `① ${mobil() ? "Bild-Paket sichern" : "Bild-Paket herunterladen"} ② Anweisung kopieren ③ im Chat beides senden. Die Fotos gehen dabei an den Anbieter.`),
        `${mobil() ? "„Bild-Paket sichern“ tippen und im Menü „Bild sichern“ wählen, dann liegt es in deinen Fotos." : "Das Bild-Paket landet im Download-Ordner."} Danach „Anweisung fürs Bild kopieren“. In ChatGPT oder Gemini mit ＋ das Bild-Paket anhängen (und bei „Ich“ ein Foto von dir), die Anweisung einfügen und senden.`,
        "Das Bild-Paket zeigt deine Originalfotos, also auch den Hintergrund (Boden, Zimmer). Schau kurz drüber, bevor du es hochlädst.",
        "In den Gratis-Versionen zählt jedes angehängte Bild zu den wenigen Uploads pro Tag."),
      el("div", { class: "actions" }, teilen, wunsch), kopierBox);
  }
  knopf.onclick = erstellen;
  bereit();
  return { el: box, erstellen };
}

// Handy: Teilen-Menü („Bilder sichern“ legt sie in die Fotos, oder direkt an die ChatGPT-App). PC: herunterladen.
// Muss direkt im Antippen laufen (navigator.share braucht ein frisches Tippen), darum werden die Bilder vorher erstellt.
async function bilderWeitergeben(dateien) {
  if (navigator.canShare?.({ files: dateien })) {
    try { await navigator.share({ files: dateien }); return true; } catch (e) { if (e?.name === "AbortError") return false; console.error(e); }
  }
  for (const f of dateien) {
    const a = el("a", { href: URL.createObjectURL(f), download: f.name }); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }
  return true;
}

/* ---------- Kopieren ---------- */
// navigator.clipboard braucht ein frisches Antippen: darum direkt im Klick aufrufen, ohne vorher auf etwas zu warten
async function kopieren(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  const ta = el("textarea", { readOnly: true, value: text, style: "position:fixed;top:0;left:0;opacity:0" });
  document.body.append(ta); ta.select(); ta.setSelectionRange(0, text.length);
  let ok = false; try { ok = document.execCommand("copy"); } catch {}
  ta.remove(); return ok;
}
// Klappt Kopieren gar nicht: Text zum Markieren zeigen
const vonHand = (box, text) => fill(box, el("div", { class: "hint" }, "Kopieren hat nicht geklappt. Tippe in das Feld, markiere alles und kopiere es selbst:"),
  el("textarea", { class: "notiz", readOnly: true, rows: 6, value: text, "aria-label": "Text zum Kopieren" }));

/* ---------- Antwort lesen ---------- */
// Neue Gruppe bei Zeilen wie „Outfit 2“, „**Kombination 1:**“, „### Option 3“, „👗 Outfit 1“, „1. Outfit“, „1️⃣ Look“, „| Outfit 2 |“, „Kaufideen“.
// Vor dem Wort darf alles stehen, was kein Buchstabe ist (Zeichen, Emojis, Tabellenstriche). Eine Nummer muss dabei sein,
// sonst würde z. B. „Look: lässig“ mitten im Outfit eine neue Gruppe anfangen.
const WORT = "outfit|kombination|kombi|option|look|vorschlag|variante|idee";
const KOPF = new RegExp(`^[^\\p{L}]*(\\d+[^\\p{L}\\d]*(${WORT})\\b|(${WORT})\\s*(nr\\.?\\s*)?\\d+|kaufideen?\\b)`, "iu");
// „Outfit Nr. 2“ ist die Nummer des Outfits, nicht die eines Teils
const OUTFIT_NR = new RegExp(`\\b(${WORT})\\s*Nr\\.?\\s*\\d+`, "gi");
const NUMMER = /\bNr\.?\s*0*(\d{1,6})\b([^\n]*?)(?=\bNr\.?\s*\d|$)/gi;
// Teile eines Outfits stehen in eigenen Zeilen („- Nr. 009 – Hemd“, „Oberteil: Nr. 040“, „1. Nr. 009“, „| Nr. 009 |“,
// „Outfit 1: Nr. 009 + Nr. 008“). Nummern mitten im Text gehören nicht dazu (Styling-Tipp „mit einer Haarklammer,
// z. B. Nr. 062“, Gemini 03.11.2026) – außer die Gruppe hat gar keine solche Zeile („Kombiniere das Hemd (Nr. 009) mit …“).
const TEIL_ZEILE = /^[^\p{L}\d]*(\d+[.)]\s*)?([\p{L}][\p{L}\d &/+-]{0,24}:[^\p{L}\d]*)?Nr\.?\s*\d/iu;
const lesbar = s => s.replace(/\*\*|__|`/g, "").replace(/^#+\s*/gm, "");
// Arten in einfacher Form („Ohrringe“ → „ohrring“), um zu sehen, ob ChatGPT bei einer Nummer ein ganz anderes Teil beschreibt
const stamm = w => w.toLowerCase().replace(/(en|e|n|s)$/, "");
const artStaemme = a => a.split(" / ").map(stamm).filter(w => w.length >= 4);
const ALLE_ARTEN = [...GROUP_OF.keys()].flatMap(artStaemme);
function passtNicht(t, beschr) {
  const s = beschr.toLowerCase(), eigen = [t.art, wieVon("Art", t.art)].filter(Boolean).flatMap(artStaemme);
  if (!s || eigen.some(w => s.includes(w))) return false;
  return ALLE_ARTEN.some(w => s.includes(w));
}
export function antwortLesen(text, items) {
  const gruppen = [];
  let akt = null;
  for (const zeile of text.split(/\r?\n/)) {
    if (!akt || KOPF.test(zeile)) { akt = { zeilen: [], nrs: [], imText: [], beschr: new Map() }; gruppen.push(akt); }
    akt.zeilen.push(zeile);
    const ohne = zeile.replace(OUTFIT_NR, ""), liste = TEIL_ZEILE.test(ohne) ? akt.nrs : akt.imText;
    for (const m of ohne.matchAll(NUMMER)) {
      const n = +m[1], b = m[2].replace(/^[\s–—\-:,(]+/, "").replace(/[\s+,;)]+$/, "").slice(0, 60);
      if (n <= 0) continue;
      if (!liste.includes(n)) liste.push(n);
      if (b && !akt.beschr.has(n)) akt.beschr.set(n, b);
    }
  }
  for (const g of gruppen) if (!g.nrs.length) g.nrs = g.imText;
  const nachNr = new Map(items.map(t => [t.nr, t])), unbekannt = new Set();
  const out = gruppen.map(g => {
    const teile = [], hinweise = [];
    for (const n of g.nrs) {
      const t = nachNr.get(n);
      if (!t) { unbekannt.add(n); continue; }
      if (t.geloescht) hinweise.push(`Nr. ${nrText(n)} liegt im Papierkorb.`);
      else if (t.nichtAnziehen) hinweise.push(`Nr. ${nrText(n)} ist als „🚫 Ziehe ich nicht an“ markiert.`);
      if (passtNicht(t, g.beschr.get(n) || "")) hinweise.push(`⚠️ In der Antwort steht bei Nr. ${nrText(n)} „${g.beschr.get(n)}“, bei dir ist es „${beschreibung(t)}“. Vielleicht kennt der Chat einen alten Stand: Gib ihm die Änderungen (Schritt 1).`);
      teile.push(t);
    }
    return { text: lesbar(g.zeilen.join("\n")).trim(), teile, hinweise };
  }).filter(g => g.text || g.teile.length);
  return { gruppen: out, unbekannt: [...unbekannt].sort((a, b) => a - b) };
}

// Outfits aus der gelesenen Antwort für Schritt 4: Gruppen mit Teilen, ohne Kaufideen. Name = Überschrift der Gruppe bis
// zum Doppelpunkt („Outfit 2“, „Look 1“), sonst „Vorschlag 1“ … Die Namen sind fremder Text und werden nur als Text gezeigt.
// Hat die Antwort Überschriften, zählen nur Gruppen mit Überschrift: Die Einleitung („Zu deiner Nr. 012 passt …“) ist kein Outfit.
const OUTFITS = ["Outfit 1", "Outfit 2", "Outfit 3"];
function outfitsAus(gruppen) {
  const namen = new Set(), kopf = g => g.text.split("\n")[0].trim();
  let liste = gruppen.filter(g => g.teile.length && !/^[^\p{L}]*kaufidee/iu.test(g.text));
  if (liste.some(g => KOPF.test(kopf(g)))) liste = liste.filter(g => KOPF.test(kopf(g)));
  const ohneZeichen = s => s.replace(/^[^\p{L}\d]+/u, "").replace(/[\s–—|-]+$/u, "");
  return liste.map(g => {
    let name = KOPF.test(kopf(g)) ? ohneZeichen(kopf(g).split(/[:|]/)[0]).slice(0, 30) : "";
    for (let k = 1; !name || namen.has(name); k++) name = `Vorschlag ${k}`; // Namen müssen eindeutig sein (Auswahl-Knöpfe)
    namen.add(name);
    // Name beim Speichern: was nach dem Doppelpunkt steht („Outfit 1: Modern Smart Casual“ → „Modern Smart Casual“)
    const danach = KOPF.test(kopf(g)) && kopf(g).includes(":") ? ohneZeichen(kopf(g).slice(kopf(g).indexOf(":") + 1)) : "";
    return { name, titel: danach || name, teile: g.teile, gruppe: g };
  });
}

/* ---------- Schritt 1: Kleiderschrank an ChatGPT geben ---------- */
// Auch in der Ansicht „Sicherung“ (zip-ansicht.js). nachher() = nach dem Kopieren des Textes (Stand neu anzeigen)
export function kleiderschrankSchritt(items, stil, nachher = () => {}) {
  const teile = kandidaten(items), status = el("div", { class: "hint" }, "…"), knoepfe = el("div", { class: "actions" }), box = el("div", {});
  let v = { nie: true };
  const vorbereiten = async (art, knopf) => {
    knopf.disabled = true; const alt = knopf.textContent; knopf.textContent = "Bilder werden erstellt …";
    try {
      const nur = art === "alles" ? teile : v.neu;
      const dateien = nur.length ? await sammelbilder(nur, art === "alles" ? "Mein Kleiderschrank" : "Neu im Kleiderschrank") : [];
      vorbereitet = { art, dateien, text: art === "alles" ? schrankText(teile, stil, dateien.length) : aenderungText(v.neu, v.weg), stand: standVon(teile) };
      zeigen();
    } catch (e) { toast("Hat nicht geklappt: " + (e?.message || e)); console.error(e); }
    finally { knopf.disabled = false; knopf.textContent = alt; }
  };
  function zeigen() {
    vorschauUrls.forEach(u => URL.revokeObjectURL(u)); vorschauUrls = [];
    if (!vorbereitet) { fill(box); return; }
    const { art, dateien, text } = vorbereitet, n = dateien.length, kopierBox = el("div", {});
    const bilderKnopf = el("button", { type: "button", class: "btn" }, mobil() ? `🖼 ${n === 1 ? "Bild" : n + " Bilder"} sichern / teilen` : `🖼 ${n === 1 ? "Bild" : n + " Bilder"} herunterladen`);
    bilderKnopf.onclick = async () => { if (await bilderWeitergeben(dateien)) toast(mobil() ? "Danach den Text kopieren" : "Heruntergeladen – jetzt den Text kopieren"); };
    const textKnopf = el("button", { type: "button", class: "btn primary" }, "📋 Text kopieren");
    textKnopf.onclick = async () => {
      if (!await kopieren(text)) { vonHand(kopierBox, text); return; }
      fill(kopierBox);
      try { await setMeta("chatgptStand", { zeit: new Date().toISOString(), teile: vorbereitet.stand }); } catch (e) { console.error(e); }
      toast("Text kopiert – jetzt zusammen mit den Bildern im Chat senden");
      vorbereitet = null; nachher(); pruefen();
    };
    const bilder = dateien.map(f => { const u = URL.createObjectURL(f); vorschauUrls.push(u); return el("img", { src: u, alt: f.name, class: "sammelbild" }); });
    fill(box, el("div", { class: "sammelbilder" }, ...bilder),
      el("p", { class: "hint" }, art === "alles"
        ? `So geht's: ① ${n ? (mobil() ? `„${n === 1 ? "Bild" : n + " Bilder"} sichern“ tippen und im Menü „Bilder sichern“ wählen – sie landen in deinen Fotos.` : "Bilder herunterladen.") : ""} ② „Text kopieren“ tippen. ③ In ChatGPT oder Gemini einen neuen Chat anlegen, mit ＋ die Bilder anhängen, den Text einfügen und senden. Alle weiteren Fragen dann in diesen Chat.`
        : `So geht's: ${n ? `① Bild${n === 1 ? "" : "er"} sichern. ② ` : "① "}„Text kopieren“. ${n ? "③" : "②"} In deinem Kleiderschrank-Chat ${n ? "das Bild anhängen und " : ""}den Text einfügen und senden.`),
      n > 3 ? el("p", { class: "hint" }, `Die kostenlosen Versionen erlauben nur wenige Uploads pro Tag (ChatGPT etwa 3). Schick heute 3 Bilder und die übrigen ${n - 3} morgen nach (einfach mit „Hier sind die weiteren Bilder“).`) : null,
      el("div", { class: "actions" }, n ? bilderKnopf : null, textKnopf), kopierBox);
  }
  async function pruefen() {
    const stand = await getMeta("chatgptStand").catch(() => null);
    v = vergleich(teile, stand);
    const alles = el("button", { type: "button", class: v.nie ? "btn primary" : "btn" }, v.nie ? "🖼 Kleiderschrank-Bilder erstellen" : "Alles neu (für einen neuen Chat)");
    alles.onclick = () => vorbereiten("alles", alles);
    const aenderung = el("button", { type: "button", class: "btn primary" }, "🖼 Nur die Änderungen vorbereiten");
    aenderung.onclick = () => vorbereiten("aenderung", aenderung);
    if (v.nie) status.textContent = `Noch nicht weitergegeben. Die App macht aus deinen ${teile.length} Teilen ${Math.max(1, Math.ceil(teile.length / PRO_BILD))} Sammelbild${teile.length > PRO_BILD ? "er" : ""} mit Nummern – so sieht ChatGPT oder Gemini deine echten Sachen.`;
    else if (v.gleich) status.textContent = `✅ Dein Chat kennt deinen aktuellen Kleiderschrank (gegeben am ${datum(new Date(v.zeit))}). Nutzt du einen anderen Chat (z. B. Gemini statt ChatGPT), gib ihn dort mit „Alles neu“.`;
    else status.textContent = `⚠️ Seit dem ${datum(new Date(v.zeit))}: ${[v.neu.length ? `${v.neu.length} neu oder geändert` : null, v.weg.length ? `${v.weg.length} nicht mehr da` : null].filter(Boolean).join(", ")}. Gib deinem Chat die Änderungen, damit er den aktuellen Stand kennt.`;
    fill(knoepfe, v.nie || v.gleich ? alles : aenderung, v.nie || v.gleich ? null : alles);
    if (!teile.length) fill(knoepfe);
  }
  pruefen(); zeigen();
  return { el: el("div", {}, status, knoepfe, box), zustand: () => v };
}
const mobil = () => /iPhone|iPad|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));

/* ---------- Anzeige unter „Outfit finden“ und „Was passt dazu?“ ---------- */
// frage = { situation: { anlass, schickWahl, temperatur, wetter } } oder { teil }; kachel(t) = kleine Kachel eines Teils
export function chatgptPanel(items, stil, frage, kachel) {
  const m = merker(frage), ergebnis = el("div", {}), kopierBox = el("div", {});
  const schritt1 = kleiderschrankSchritt(items, stil, () => { schrank.open = false; });
  const schrank = el("details", { class: "mehr" }, el("summary", {}, "1. Kleiderschrank an den Chat geben"), schritt1.el);
  // Aufklappen, solange der Chat den aktuellen Stand nicht kennt
  getMeta("chatgptStand").then(st => { const v = vergleich(kandidaten(items), st); if (v.nie || !v.gleich) schrank.open = true; }).catch(() => { schrank.open = true; });

  const freitext = el("textarea", { class: "notiz", maxLength: 300, rows: 2, value: m.zusatz, placeholder: frage.teil ? "z. B. fürs Büro, eher locker" : "z. B. Italiener, Freitagabend, will nicht frieren", "aria-label": "Noch etwas dazu" });
  freitext.oninput = () => { m.zusatz = freitext.value; };
  const STIL = "Meinen Stil mitschicken";
  const optionen = choice({ options: [STIL], selected: stilMit ? [STIL] : [], max: 0, onChange: sel => { stilMit = sel.includes(STIL); } });
  const q = frage.situation || {}, nichtsAngetippt = !frage.teil && !q.anlass && !q.schickWahl && !q.temperatur && !q.wetter?.length;
  const knopfAnfrage = el("button", { type: "button", class: "btn primary" }, "📋 Anfrage kopieren");
  knopfAnfrage.onclick = async () => {
    const text = anfrageText(frage, cleanText(freitext.value), stil);
    if (!await kopieren(text)) { vonHand(kopierBox, text); return; }
    fill(kopierBox);
    // Ohne aktuellen Kleiderschrank im Chat rät die KI oder nennt alte Nummern
    const v = schritt1.zustand();
    if (v.nie) { fill(kopierBox, el("p", { class: "hint" }, "⚠️ Anfrage kopiert. Dein Chat kennt deinen Kleiderschrank aber noch nicht: Gib ihn zuerst (Schritt 1), dann die Anfrage in denselben Chat.")); schrank.open = true; }
    else if (!v.gleich) { fill(kopierBox, el("p", { class: "hint" }, "⚠️ Anfrage kopiert. Dein Kleiderschrank hat sich aber geändert: Am besten erst die Änderungen geben (Schritt 1).")); schrank.open = true; }
    else toast("Anfrage kopiert – jetzt in deinem Kleiderschrank-Chat einfügen");
  };
  // Kein Knopf „ChatGPT öffnen“: Aus der Home-Bildschirm-App öffnete er nur die Web-Seite, nicht die ChatGPT-App (Ali, 03.11.2026)

  // Schritt 4: Bild als eigene Nachricht, wenn die Antwort mit den Outfits da ist. Ist sie eingefügt, wählt sie ein Outfit
  // daraus und bekommt ein Bild-Paket mit genau diesen Teilen; sonst nur den Bild-Wunsch (Outfit 1/2/3, Sammelbilder).
  const schritt4 = el("div", {});
  function bildSchritt(gruppen) {
    const outfits = gruppen ? outfitsAus(gruppen) : [];
    if (!outfits.length) {
      const bildBox = el("div", {});
      const wahl = choice({ options: ["Outfit 1", "Outfit 2", "Outfit 3"], selected: [m.bildOutfit], onChange: sel => { m.bildOutfit = sel[0] || "Outfit 1"; } });
      const knopfBild = el("button", { type: "button", class: "btn" }, "📋 Anweisung fürs Bild kopieren");
      knopfBild.onclick = async () => {
        const text = bildText(`${OUTFITS.includes(m.bildOutfit) ? m.bildOutfit : "Outfit 1"} aus deiner Antwort`);
        if (!await kopieren(text)) { vonHand(bildBox, text); return; }
        fill(bildBox); toast("Anweisung kopiert – im selben Chat einfügen");
      };
      fill(schritt4, field("4. Bild vom Outfit (freiwillig)", "Welches Outfit?", wahl.el,
          "Erst, wenn die Antwort mit den Outfits da ist. Tipp: Füg die Antwort zuerst bei Schritt 3 ein. Dann macht die App ein Bild-Paket mit genau diesen Teilen in groß, und das Bild wird deinen echten Sachen ähnlicher."),
        traegtWahl(),
        el("div", { class: "actions" }, knopfBild), bildBox);
      return;
    }
    const paketBox = el("div", {});
    const zeigen = (o, sofort) => { const b = bildPaketBereich(o.teile, `„${o.name}“ aus deiner Antwort`); fill(paketBox, b.el); if (sofort) b.erstellen(); };
    const wahl = choice({ options: outfits.map(o => o.name), selected: outfits.some(o => o.name === m.bildOutfit) ? [m.bildOutfit] : [],
      onChange: sel => { m.bildOutfit = sel[0] || ""; const o = outfits.find(o => o.name === sel[0]); if (o) zeigen(o, true); else fill(paketBox); } });
    const gewaehlt = outfits.find(o => o.name === m.bildOutfit);
    if (gewaehlt) zeigen(gewaehlt, false);
    fill(schritt4, field("4. Bild vom Outfit (freiwillig)", "Welches Outfit?", wahl.el,
      "Die App legt die Teile des Outfits groß in ein Bild-Paket. Das hängst du im Chat zusammen mit der Anweisung an, dann bleibt das Bild näher an deinen echten Sachen."), paketBox);
  }

  const feld = el("textarea", { class: "notiz", maxLength: MAX_ANTWORT, rows: 4, value: m.antwort, placeholder: "Antwort aus dem Chat hier einfügen", "aria-label": "Antwort aus dem Chat" });
  feld.oninput = () => { m.antwort = feld.value; };
  // Eingefügt → gleich anzeigen (der Knopf „Outfits anzeigen“ bleibt für selbst getippte Änderungen)
  feld.onpaste = () => setTimeout(() => { m.antwort = feld.value; anzeigen(feld.value); }, 0);
  const anzeigen = text => {
    m.angezeigt = text.slice(0, MAX_ANTWORT);
    if (!m.angezeigt.trim()) { fill(ergebnis); bildSchritt(null); return; }
    const { gruppen, unbekannt } = antwortLesen(m.angezeigt, items);
    bildSchritt(gruppen);
    const outfitVon = new Map(outfitsAus(gruppen).map(o => [o.gruppe, o]));
    fill(ergebnis,
      unbekannt.length ? el("p", { class: "hint" }, `${unbekannt.map(n => "Nr. " + nrText(n)).join(", ")} gibt es in deinem Kleiderschrank nicht. Vielleicht kennt der Chat noch einen alten Stand: Gib ihm die Änderungen (Schritt 1).`) : null,
      !gruppen.some(g => g.teile.length) ? el("p", { class: "hint" }, "In der Antwort stehen keine Nummern von deinen Teilen. Bitte im Chat: „Nenne bitte jedes Teil mit seiner Nummer.“") : null,
      ...gruppen.map(g => el("div", { class: "panel kombi" },
        g.teile.length ? el("div", { class: "kombi-nummern" }, g.teile.map(t => `Nr. ${nrText(t.nr)}`).join(" + ")) : null,
        g.teile.length ? el("div", { class: "kombi-teile" }, ...g.teile.map(kachel)) : null,
        ...g.hinweise.map(h => el("p", { class: "hint" }, h)),
        el("div", { class: "chatgpt-text" }, g.text),
        outfitVon.has(g) ? el("div", { class: "actions" }, speichernKnopf(g.teile, outfitVon.get(g).titel, g.text, "chat")) : null)));
  };
  const knopfZeigen = el("button", { type: "button", class: "btn" }, "Outfits anzeigen");
  knopfZeigen.onclick = () => { anzeigen(feld.value); ergebnis.scrollIntoView({ behavior: "smooth" }); };
  const leeren = el("button", { type: "button", class: "btn" }, "Leeren");
  leeren.onclick = () => { feld.value = m.antwort = m.angezeigt = ""; fill(ergebnis); bildSchritt(null); };
  anzeigen(m.angezeigt); // nach dem Neuzeichnen (z. B. Zurück von einem Teil) wieder da

  return el("div", { class: "panel chatgpt" },
    mitInfo(el("strong", {}, "💬 Mit ChatGPT oder Gemini"),
      "Eine Chat-KI wie ChatGPT oder Gemini sieht deine echten Sachen auf Fotos, kennt Trends und macht kreativere Vorschläge als die festen Regeln der App. Du lädst die Bilder und den Text selbst im Chat hoch – die App schickt nichts. Ist eine KI für heute am Limit, nimm die andere.",
      "Was an den Anbieter geht: die Fotos deiner Teile, ihre Angaben (auch Notizen), „Mein Stil“ (wenn angehakt) und ein Foto von dir, falls du eins anhängst.",
      "In den Einstellungen kannst du ausschalten, dass deine Chats zum Verbessern der KI genutzt werden. ChatGPT: „Datenkontrollen“, der Chat bleibt erhalten. Gemini: „Gemini-Apps-Aktivität“ bzw. „Aktivität speichern“; ist sie aus, bleibt ein Chat dort aber nur wenige Tage, danach den Kleiderschrank neu geben."),
    el("div", { class: "hint" }, "Was du dort hochlädst, geht an OpenAI (ChatGPT) bzw. Google (Gemini)."),
    schrank,
    field(frage.teil ? "2. Fragen: Was passt dazu?" : "2. Nach Outfits fragen", "Noch etwas dazu? (freiwillig)", freitext),
    nichtsAngetippt ? el("p", { class: "hint" }, "Tipp: Oben ist noch nichts angetippt. Tipp Anlass, Temperatur und Wetter an, dann weiß der Chat, wofür das Outfit ist.") : null,
    optionen.el,
    el("div", { class: "actions" }, knopfAnfrage), kopierBox,
    field("3. Antwort einfügen", null, feld, "Kopiere die ganze Antwort aus dem Chat und füge sie hier ein. Die App zeigt die Outfits dann mit deinen Fotos. Übernommen werden nur die Nummern, der Text bleibt nur hier zum Lesen."),
    el("div", { class: "actions" }, leeren, knopfZeigen),
    ergebnis,
    schritt4);
}
