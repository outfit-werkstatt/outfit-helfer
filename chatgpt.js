// ChatGPT (Entscheidung 4, unterer Teil): Text zum Kopieren und „ChatGPT-Antwort einfügen“.
// Ablauf (Wunsch 02.11.2026): einmal den ganzen Kleiderschrank in einen eigenen ChatGPT-Chat geben (ohne Ordner-Auswahl),
// danach pro Situation oder Teil nur noch eine kurze Anfrage in denselben Chat.
// Die App schickt selbst nichts: Sie kopiert Text, den die Nutzerin selbst in ChatGPT einfügt (Hinweis auf OpenAI steht dabei).
// Die eingefügte Antwort ist fremder Text: nur per textContent anzeigen, nur Nummern daraus übernehmen.
import { el, fill, field, choice, toast, beschreibung, cleanText, saisonVorschlag, wieVon } from "./ui.js?v=12";
import { nrText, getMeta, setMeta } from "./speicher.js?v=8";
import { stilAktuell, stilZeilen } from "./stil.js?v=11";
import { kandidaten } from "./regeln.js?v=6";
import { GROUP_OF } from "./ki.js?v=6";

const MAX_ANTWORT = 20000;
// Pro Sitzung gemerkt: Ansichten werden bei jedem Tippen neu gezeichnet, Eingetipptes und Eingefügtes soll dabei bleiben.
// Getrennt je Frage („Outfit finden“ bzw. „Was passt dazu?“ für ein bestimmtes Teil), damit nichts in die falsche Ansicht wandert.
let stilMit = null; // null = noch nicht angetippt → wie beim letzten Kopieren (sonst an)
const merk = new Map(); // Schlüssel → { zusatz, antwort, angezeigt }
const merker = frage => { const k = frage.teil ? "teil:" + frage.teil.nr : "situation"; if (!merk.has(k)) merk.set(k, { zusatz: "", antwort: "", angezeigt: "" }); return merk.get(k); };

/* ---------- Texte ---------- */
const datum = d => d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
const ohneUmbruch = s => s.replace(/\s*\n\s*/g, " / ");
// Eine Zeile pro Teil, z. B. „Nr. 012 – T-Shirt, braun; Material: Baumwolle; Ärmel: kurz; Saison: Sommer“
export function teilZeile(t) {
  const z = [`Nr. ${nrText(t.nr)} – ${beschreibung(t)}`];
  if (t.muster && t.muster !== "Einfarbig") z.push("Muster: " + t.muster);
  if (t.material) z.push("Material: " + t.material);
  for (const [k, n] of [["aermel", "Ärmel"], ["schnitt", "Hosenschnitt"], ["weite", "Weite"], ["laenge", "Länge"], ["bund", "Bund"]]) if (t[k]) z.push(`${n}: ${t[k]}`);
  if (t.stil?.length) z.push("Stil: " + t.stil.join(", "));
  z.push("Saison: " + (t.saison?.length ? t.saison : saisonVorschlag(t.art, t.gruppe, t.material)).join(", "));
  if (t.notiz) z.push("Notiz: " + ohneUmbruch(t.notiz));
  return z.join("; ");
}
const MODE_TEXT = { Damen: "Damenmode", Herren: "Herrenmode", beides: "Damen- und Herrenmode" };
// Der ganze Kleiderschrank (ohne Papierkorb und 🚫) mit Spielregeln. kern = alles außer dem Datum, für den Vergleich „noch aktuell?“
function schrankText(items, stil, mitStil) {
  const teile = kandidaten(items).sort((a, b) => a.nr - b.nr), s = stilAktuell(stil), zeilen = mitStil ? stilZeilen(s) : [];
  const kopf = [
    "Hallo! Bitte hilf mir in diesem Chat, Outfits aus meinem Kleiderschrank zusammenzustellen.", "",
    "So machen wir es:",
    "- Unten steht mein ganzer Kleiderschrank. Jedes Teil hat eine feste Nummer.",
    "- Danach schicke ich dir eine Situation (Anlass, Wetter) oder ein Teil, das ich tragen möchte.",
    "- Schlag mir dann bis zu 3 Outfits vor, nur aus diesen Teilen. Schreib jedes so: „Outfit 1: Nr. 012 + Nr. 031 + Nr. 007“. Nenne jedes Teil mit Nummer und kurzer Beschreibung (z. B. „Nr. 012 – T-Shirt, braun“) und gib 1 bis 3 konkrete Styling-Tipps.",
    "- Erfinde keine Nummern. Fehlt für ein gutes Outfit etwas (z. B. passende Schuhe), sag es ehrlich.",
    "- Kaufideen bitte nur allgemein (z. B. „camelfarbener Gürtel“), ohne Shops und ohne Links.",
    "- Schicke ich dir später einen neuen Kleiderschrank, gilt nur noch der neue."
  ];
  if (MODE_TEXT[s.mode]) kopf.push("", "Mode: " + MODE_TEXT[s.mode]);
  if (zeilen.length) kopf.push("", "Mein Stil (Vorlieben, keine Verbote – schlag gern auch mal eine Alternative vor):", ...zeilen.map(z => "- " + z));
  const liste = teile.map(teilZeile);
  const kern = [...kopf, "", `Mein Kleiderschrank (${teile.length} Teile):`, ...liste].join("\n");
  const text = [...kopf, "", `Mein Kleiderschrank (Stand ${datum(new Date())}, ${teile.length} Teile):`, ...liste, "",
    `Antworte jetzt bitte nur kurz mit „Verstanden, ${teile.length} Teile“.`].join("\n");
  return { text, kern, anzahl: teile.length };
}
// Kurzer Fingerabdruck (FNV-1a), um zu sehen, ob sich seit dem Kopieren etwas geändert hat
const fingerabdruck = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); };
const LISTE_OBEN = "aus meinem Kleiderschrank (die Liste oben in diesem Chat)";
function anfrageText(frage, freitext) {
  const dazu = freitext ? `Dazu: ${ohneUmbruch(freitext)}` : null;
  if (frage.teil) return [`Ich möchte Nr. ${nrText(frage.teil.nr)} – ${beschreibung(frage.teil)} tragen.`, dazu,
    `Bitte zeig mir bis zu 3 Kombinationen damit ${LISTE_OBEN}, mit Nummern und Styling-Tipps.`,
    "Nenn mir außerdem höchstens 3 allgemeine Kaufideen, was noch gut dazu passen würde (ohne Shops, ohne Links)."].filter(Boolean).join("\n");
  return [frage.situation ? `Neue Situation: ${frage.situation}` : "Ich suche ein Outfit.", dazu,
    `Bitte schlag mir bis zu 3 Outfits ${LISTE_OBEN} vor, mit Nummern und Styling-Tipps.`].filter(Boolean).join("\n");
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
    if (!akt || KOPF.test(zeile)) { akt = { zeilen: [], nrs: [], beschr: new Map() }; gruppen.push(akt); }
    akt.zeilen.push(zeile);
    for (const m of zeile.replace(OUTFIT_NR, "").matchAll(NUMMER)) {
      const n = +m[1], b = m[2].replace(/^[\s–—\-:,(]+/, "").replace(/[\s+,;)]+$/, "").slice(0, 60);
      if (n <= 0) continue;
      if (!akt.nrs.includes(n)) akt.nrs.push(n);
      if (b && !akt.beschr.has(n)) akt.beschr.set(n, b);
    }
  }
  const nachNr = new Map(items.map(t => [t.nr, t])), unbekannt = new Set();
  const out = gruppen.map(g => {
    const teile = [], hinweise = [];
    for (const n of g.nrs) {
      const t = nachNr.get(n);
      if (!t) { unbekannt.add(n); continue; }
      if (t.geloescht) hinweise.push(`Nr. ${nrText(n)} liegt im Papierkorb.`);
      else if (t.nichtAnziehen) hinweise.push(`Nr. ${nrText(n)} ist als „🚫 Ziehe ich nicht an“ markiert.`);
      if (passtNicht(t, g.beschr.get(n) || "")) hinweise.push(`⚠️ ChatGPT beschreibt Nr. ${nrText(n)} als „${g.beschr.get(n)}“, bei dir ist es „${beschreibung(t)}“. Vielleicht kennt ChatGPT einen alten Stand: Kopiere den Kleiderschrank neu.`);
      teile.push(t);
    }
    return { text: lesbar(g.zeilen.join("\n")).trim(), teile, hinweise };
  }).filter(g => g.text || g.teile.length);
  return { gruppen: out, unbekannt: [...unbekannt].sort((a, b) => a - b) };
}

/* ---------- Anzeige ---------- */
// frage = { situation: "Essen gehen · schick · …" } oder { teil }; kachel(t) = kleine Kachel eines Teils
export function chatgptPanel(items, stil, frage, kachel) {
  const m = merker(frage);
  const s1 = el("div", {}), status = el("div", { class: "hint" }, "…"), kopierBox1 = el("div", {}), kopierBox2 = el("div", {}), ergebnis = el("div", {});
  const MIT = "Meinen Stil mitschicken";
  const stilWahl = choice({ options: [MIT], selected: stilMit !== false ? [MIT] : [], onChange: sel => { stilMit = sel.length > 0; pruefen(); } });
  const schrank = el("details", { class: "mehr" }, el("summary", {}, "1. Kleiderschrank an ChatGPT geben"), s1);
  // Ist der Kleiderschrank in ChatGPT noch aktuell? (verglichen wird mit dem, was zuletzt kopiert wurde)
  let zustand = "unbekannt"; // "nie" | "aktuell" | "alt"
  async function pruefen() {
    const stand = await getMeta("chatgptStand").catch(() => null);
    // Häkchen wie beim letzten Kopieren, solange es in dieser Sitzung nicht angetippt wurde (sonst hieße es fälschlich „geändert“)
    if (stilMit === null && stand && stand.mitStil === false) stilWahl.set([]);
    const mit = stilMit ?? stand?.mitStil ?? true, { kern } = schrankText(items, stil, mit);
    zustand = !stand ? "nie" : stand.fingerabdruck === fingerabdruck(kern) ? "aktuell" : "alt";
    status.textContent = zustand === "nie" ? "Noch nicht kopiert. Leg in ChatGPT einen neuen Chat an (z. B. „Mein Kleiderschrank“) und füge ihn dort ein."
      : zustand === "aktuell" ? `✅ Zuletzt kopiert am ${datum(new Date(stand.zeit))}, seitdem nichts geändert.`
      : `⚠️ Seit dem Kopieren am ${datum(new Date(stand.zeit))} hat sich etwas geändert (Teile oder „Mein Stil“). Kopiere den Kleiderschrank neu und füge ihn in denselben Chat ein.`;
    if (zustand !== "aktuell") schrank.open = true;
  }
  const knopfSchrank = el("button", { type: "button", class: "btn" }, "📋 Kleiderschrank kopieren");
  knopfSchrank.onclick = async () => {
    const mit = stilWahl.get().length > 0, { text, kern, anzahl } = schrankText(items, stil, mit);
    if (!anzahl) { toast("Im Kleiderschrank ist noch nichts, das ChatGPT vorschlagen könnte."); return; }
    if (!await kopieren(text)) { vonHand(kopierBox1, text); return; }
    fill(kopierBox1);
    try { await setMeta("chatgptStand", { zeit: new Date().toISOString(), fingerabdruck: fingerabdruck(kern), mitStil: mit }); } catch (e) { console.error(e); }
    toast(`Kleiderschrank kopiert (${anzahl} Teile) – jetzt in ChatGPT einfügen`);
    pruefen();
  };
  fill(s1, status, stilWahl.el, el("div", { class: "actions" }, knopfSchrank), kopierBox1,
    el("div", { class: "hint" }, "Einmal einfügen genügt. Danach stellst du alle Fragen in diesem Chat. Hast du Teile oder „Mein Stil“ geändert, kopierst du den Kleiderschrank neu."));
  pruefen();

  const freitext = el("textarea", { class: "notiz", maxLength: 300, rows: 2, value: m.zusatz, placeholder: frage.teil ? "z. B. fürs Büro, eher locker" : "z. B. Italiener, Freitagabend, will nicht frieren", "aria-label": "Noch etwas dazu" });
  freitext.oninput = () => { m.zusatz = freitext.value; };
  const knopfAnfrage = el("button", { type: "button", class: "btn primary" }, "📋 Anfrage kopieren");
  knopfAnfrage.onclick = async () => {
    const text = anfrageText(frage, cleanText(freitext.value));
    if (!await kopieren(text)) { vonHand(kopierBox2, text); return; }
    fill(kopierBox2);
    // Ohne aktuellen Kleiderschrank im Chat rät ChatGPT oder nennt alte Nummern
    if (zustand === "nie") { fill(kopierBox2, el("p", { class: "hint" }, "⚠️ Anfrage kopiert. ChatGPT kennt deinen Kleiderschrank aber noch nicht: Kopiere ihn zuerst (Schritt 1) und füge ihn in den Chat ein, dann die Anfrage.")); schrank.open = true; }
    else if (zustand === "alt") { fill(kopierBox2, el("p", { class: "hint" }, "⚠️ Anfrage kopiert. Dein Kleiderschrank hat sich aber seit dem letzten Kopieren geändert: Am besten erst neu kopieren und einfügen (Schritt 1).")); schrank.open = true; }
    else toast("Anfrage kopiert – jetzt in deinem Kleiderschrank-Chat einfügen");
  };
  const oeffnen = el("a", { class: "btn", href: "https://chatgpt.com/", target: "_blank", rel: "noopener noreferrer" }, "ChatGPT öffnen ↗");

  const feld = el("textarea", { class: "notiz", maxLength: MAX_ANTWORT, rows: 4, value: m.antwort, placeholder: "Antwort von ChatGPT hier einfügen", "aria-label": "Antwort von ChatGPT" });
  feld.oninput = () => { m.antwort = feld.value; };
  const zeigen = text => {
    m.angezeigt = text.slice(0, MAX_ANTWORT);
    if (!m.angezeigt.trim()) { fill(ergebnis); return; }
    const { gruppen, unbekannt } = antwortLesen(m.angezeigt, items);
    fill(ergebnis,
      unbekannt.length ? el("p", { class: "hint" }, `${unbekannt.map(n => "Nr. " + nrText(n)).join(", ")} gibt es in deinem Kleiderschrank nicht. Vielleicht kennt ChatGPT noch einen alten Stand: Kopiere den Kleiderschrank neu.`) : null,
      ...gruppen.map(g => el("div", { class: "panel kombi" },
        g.teile.length ? el("div", { class: "kombi-nummern" }, g.teile.map(t => `Nr. ${nrText(t.nr)}`).join(" + ")) : null,
        g.teile.length ? el("div", { class: "kombi-teile" }, ...g.teile.map(kachel)) : null,
        ...g.hinweise.map(h => el("p", { class: "hint" }, h)),
        el("div", { class: "chatgpt-text" }, g.text))));
  };
  const knopfZeigen = el("button", { type: "button", class: "btn" }, "Outfits anzeigen");
  knopfZeigen.onclick = () => { zeigen(feld.value); ergebnis.scrollIntoView({ behavior: "smooth" }); };
  const leeren = el("button", { type: "button", class: "btn" }, "Leeren");
  leeren.onclick = () => { feld.value = m.antwort = m.angezeigt = ""; fill(ergebnis); };
  if (m.angezeigt) zeigen(m.angezeigt); // nach dem Neuzeichnen (z. B. Zurück von einem Teil) wieder da

  return el("div", { class: "panel chatgpt" },
    el("strong", {}, "💬 Mit ChatGPT"),
    el("div", { class: "hint" }, "ChatGPT kennt Trends und macht kreativere Vorschläge als die festen Regeln der App. Du kopierst Text und fügst ihn selbst in ChatGPT ein – die App schickt nichts."),
    el("div", { class: "hint" }, "Was du in ChatGPT einfügst, geht an OpenAI: deine Teile als Text (Nummer, Art, Farbe, Material, Notizen …) und, wenn angehakt, „Mein Stil“. Fotos sind nicht dabei. Tipp: In den Einstellungen von ChatGPT unter „Datenkontrollen“ kannst du ausschalten, dass deine Chats zum Verbessern des Modells genutzt werden."),
    schrank,
    field(frage.teil ? "2. Fragen: Was passt dazu?" : "2. Nach Outfits fragen", "Noch etwas dazu? (freiwillig)", freitext),
    el("div", { class: "actions" }, knopfAnfrage, oeffnen), kopierBox2,
    field("3. Antwort einfügen", "Kopiere die Antwort aus ChatGPT und füge sie hier ein. Die App zeigt die Outfits mit deinen Fotos.", feld),
    el("div", { class: "actions" }, leeren, knopfZeigen),
    ergebnis);
}
