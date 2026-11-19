// „🏠 Sachen im Haushalt“ (seit 0.32, Wunsch 19.11.2026): Dinge aus dem Haushalt mit Foto. Von unterwegs sehen, was man schon hat
// und wo es liegt; später verkaufen (Etappe 3). Getrennt von der Kleidung: eigener Speicherbereich, eigene Nummern (H001 …), darum
// kommt ein Ding nie in Outfit-Vorschläge, in den Chat-Kleiderschrank oder in den Koffer.
// Erkennung: Die KI der App ist auf Mode trainiert. Ob sie Haushaltsdinge erkennt, wird erst mit echten Fotos gemessen; bis dahin
// tippt sie die Kategorie selbst an. Neue Fotos werden sofort gespeichert (ohne Prüfen-Karte wie bei der Kleidung) und stehen unter
// „Noch ergänzen“, bis sie „✓ Fertig“ tippt. So geht nichts verloren, wenn das iPhone die App schließt; Eingetipptes wird beim
// Tippen gespeichert.
// Texte nur per textContent/value, nie per innerHTML (Name, Ort, Notiz sind eingetippt).
import { el, fill, toast, fehlerToast, field, choice, clean, cleanText, zeigeGross, datumText, markenFeld, merkeMarken, mitInfo, mitWachSperre } from "./ui.js?v=21";
import { addDing, allDinge, getDingFoto, updateDing, purgeDinge, dingNrText } from "./speicher.js?v=12";
import { loadImage, alsJpg } from "./ki.js?v=9";
import { preisLesen, preisText, preisPruefen, plattformPruefen, verkaufFeld, verkaufKurz, verkaufZeichen, imVerkauf, istVerkauft, VERKAUF_STUFEN,
  EINGESTELLT } from "./verkauf.js?v=4";
import { renderDingText } from "./ding-text.js?v=1";

// Als Knöpfe nur die häufigsten, der Rest unter „Andere …“ (sonst ist jede Karte bei „Noch ergänzen“ sehr lang)
const KATEGORIEN_KNOEPFE = ["Küche", "Elektronik", "Deko", "Möbel", "Bücher & Medien", "Spiele & Spielzeug", "Werkzeug & Garten", "Sonstiges"];
const KATEGORIEN_MEHR = ["Haushaltsgeräte", "Heimtextilien", "Sport & Freizeit", "Bad & Pflege", "Baby & Kind", "Büro & Schreibwaren"];
export const KATEGORIEN = [...KATEGORIEN_KNOEPFE, ...KATEGORIEN_MEHR];
const RAEUME_KNOEPFE = ["Wohnzimmer", "Küche", "Schlafzimmer", "Bad", "Kinderzimmer", "Keller"];
const RAEUME_MEHR = ["Flur", "Arbeitszimmer", "Dachboden", "Garage", "Balkon"];
export const RAEUME = [...RAEUME_KNOEPFE, ...RAEUME_MEHR];
// Zustände für Haushaltsdinge („Neu mit Etikett“ wie bei Kleidung passt hier selten); für die Plattform-Texte später umgesetzt
export const DING_ZUSTAENDE = ["Neu, unbenutzt", "Sehr gut", "Gut", "Zufriedenstellend", "Defekt"];
export const MAX_NAME = 60, MAX_ORT = 60, MAX_NOTIZ = 200, MAX_MENGE = 999, MAX_AN = 40;
const KORB_TAGE = 30, TAG = 24 * 3600 * 1000;

export const dingName = d => d.name || d.kategorie || "noch ohne Namen";
export const dingTitel = d => `${dingNrText(d.nr)} – ${dingName(d)}`;
export const woText = d => [d.raum, d.ort].filter(Boolean).join(" · ");
const anzahl = n => `${n} ${n === 1 ? "Ding" : "Dinge"}`;
// Verliehen an … (seit 0.32, Wunsch 19.11.2026): { an, seit } am Ding
const seitText = iso => { const n = Math.max(0, Math.round((new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / TAG)); return n === 0 ? "seit heute" : n === 1 ? "seit gestern" : `seit ${n} Tagen`; };
export const verliehenKurz = d => d.verliehen ? `🤝 an ${d.verliehen.an}, ${seitText(d.verliehen.seit)}` : null;
// Nummer → Name der Umzugskiste, in der das Ding liegt (umzug.js)
const kistenNamen = kisten => new Map((kisten || []).flatMap(k => k.nrs.map(nr => [nr, k.name])));
const restTage = d => Math.max(0, KORB_TAGE - Math.floor((Date.now() - Date.parse(d.geloescht)) / TAG));
const nochTage = d => { const n = restTage(d); return n <= 0 ? "noch heute" : n === 1 ? "noch 1 Tag" : `noch ${n} Tage`; };

/* ---------- Prüfen (Sicherung laden, zip-ansicht.js) ----------
   Die Datei kann von irgendwoher stammen: nur bekannte Felder, Texte gekürzt, Zahlen in Grenzen. Nummer prüft zip-ansicht.js. */
const textVon = (v, max) => typeof v === "string" ? clean(v).slice(0, max).trim() || null : null;
const zeitVon = v => typeof v === "string" && v.length < 40 && !isNaN(Date.parse(v)) ? new Date(v).toISOString() : null;
export function dingPruefen(d) {
  const jetzt = new Date().toISOString();
  return { nr: d.nr, kategorie: textVon(d.kategorie, 30), name: textVon(d.name, MAX_NAME), marke: textVon(d.marke, 40),
    raum: textVon(d.raum, 30), ort: textVon(d.ort, MAX_ORT),
    menge: Number.isInteger(d.menge) && d.menge >= 1 && d.menge <= MAX_MENGE ? d.menge : null,
    zustand: DING_ZUSTAENDE.includes(d.zustand) ? d.zustand : null, kaufpreis: preisPruefen(d.kaufpreis),
    notiz: typeof d.notiz === "string" ? cleanText(d.notiz).slice(0, MAX_NOTIZ) || null : null, ergaenzen: d.ergaenzen === true,
    // Verkaufen wie bei der Kleidung (verkauf.js)
    verkauf: VERKAUF_STUFEN.includes(d.verkauf) ? d.verkauf : null, preis: preisPruefen(d.preis), erloes: preisPruefen(d.erloes),
    eingestelltAm: zeitVon(d.eingestelltAm), verkauftAm: zeitVon(d.verkauftAm), plattform: plattformPruefen(d.plattform),
    // Verliehen an … (seit 0.32): Name höchstens 40 Zeichen, seit wann
    verliehen: d.verliehen && typeof d.verliehen === "object" && textVon(d.verliehen.an, MAX_AN) ? { an: textVon(d.verliehen.an, MAX_AN), seit: zeitVon(d.verliehen.seit) || jetzt } : null,
    erstellt: zeitVon(d.erstellt) || jetzt, geaendert: zeitVon(d.geaendert) || zeitVon(d.erstellt) || jetzt };
}

/* ---------- Angaben als Felder ----------
   werte = gespeicherte Angaben, onChange() nach jeder Änderung (auch beim Tippen). kurz = nur Kategorie, Name, Raum, Ort
   (für „Noch ergänzen“). get() = die Angaben, fehler() = Text, wenn etwas nicht stimmt (sonst null), dispose() beim Neuzeichnen. */
function dingFelder(werte, onChange = () => {}, kurz = false) {
  const kat = choice({ field: "Haushalt-Kategorie", options: KATEGORIEN_KNOEPFE, more: KATEGORIEN_MEHR, selected: werte.kategorie ? [werte.kategorie] : [], beispiel: "z. B. Fotografie", onChange });
  const raum = choice({ field: "Raum", options: RAEUME_KNOEPFE, more: RAEUME_MEHR, selected: werte.raum ? [werte.raum] : [], beispiel: "z. B. Abstellraum", onChange });
  const eingabe = (wert, max, placeholder, label, extra = {}) => {
    const i = el("input", { type: "text", class: "feld-eingabe", maxLength: max, value: wert ?? "", placeholder, autocomplete: "off", enterKeyHint: "done", "aria-label": label, ...extra });
    i.oninput = onChange; i.onkeydown = e => { if (e.key === "Enter") i.blur(); };
    return i;
  };
  const name = eingabe(werte.name, MAX_NAME, "z. B. Wasserkocher", "Name");
  const ort = eingabe(werte.ort, MAX_ORT, "z. B. Regal oben, Kiste 3", "Wo genau");
  const felder = [field("Was ist es?", null, kat.el), field("Name", "kurz, z. B. „Wasserkocher“ oder „Lego Feuerwehr“", name),
    field("Wo liegt es?", "freiwillig", raum.el), field("Wo genau?", "freiwillig", ort)];
  let mehr = null;
  if (!kurz) {
    const marke = markenFeld(werte.marke || ""); marke.input.oninput = onChange;
    const menge = eingabe(werte.menge ?? "", 3, "z. B. 6", "Anzahl", { inputMode: "numeric" });
    menge.classList.add("preis-eingabe");
    const zustand = choice({ options: DING_ZUSTAENDE, selected: werte.zustand ? [werte.zustand] : [], onChange });
    const preisAlsText = n => n == null ? "" : Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ",");
    const kauf = eingabe(preisAlsText(werte.kaufpreis), 10, "z. B. 25", "Gekauft für", { inputMode: "decimal" });
    kauf.classList.add("preis-eingabe");
    const notiz = el("textarea", { class: "notiz", maxLength: MAX_NOTIZ, rows: 2, value: werte.notiz || "", placeholder: "z. B. Deckel fehlt, nur 2× benutzt", "aria-label": "Notiz" });
    notiz.oninput = onChange;
    felder.push(field("Marke", "freiwillig", marke.el),
      field("Anzahl", "freiwillig, z. B. bei 6 Gläsern", el("span", { class: "preis-feld" }, menge, el("span", {}, "Stück"))),
      field("Zustand", "freiwillig", zustand.el),
      field("Gekauft für", "freiwillig, für deine Verkaufs-Übersicht", el("span", { class: "preis-feld" }, kauf, el("span", {}, "€"))),
      field("Notiz", "freiwillig, bleibt auf deinem Handy", notiz));
    mehr = { marke, menge, zustand, kauf, notiz };
  }
  const mengeVon = v => { const s = clean(v); return !s ? null : /^\d{1,3}$/.test(s) && Number(s) >= 1 ? Number(s) : undefined; };
  return {
    elements: felder,
    get: () => ({
      kategorie: kat.get()[0] || null, name: clean(name.value).slice(0, MAX_NAME) || null, raum: raum.get()[0] || null, ort: clean(ort.value).slice(0, MAX_ORT) || null,
      ...(mehr ? { marke: mehr.marke.get(), menge: mengeVon(mehr.menge.value) ?? null, zustand: mehr.zustand.get()[0] || null,
        kaufpreis: preisLesen(mehr.kauf.value) ?? null, notiz: cleanText(mehr.notiz.value).slice(0, MAX_NOTIZ) || null } : {})
    }),
    fehler: () => {
      if (!mehr) return null;
      if (mengeVon(mehr.menge.value) === undefined) return "Bei „Anzahl“ bitte nur eine Zahl eintippen, z. B. 6.";
      if (preisLesen(mehr.kauf.value) === undefined) return "Bei „Gekauft für“ bitte nur einen Betrag eintippen, z. B. 25 oder 24,99.";
      return null;
    },
    dispose: () => { kat.dispose(); raum.dispose(); }
  };
}

/* ---------- Fotos hinzufügen ---------- */
// Jedes Foto: verkleinert (ca. 1200 px) und als Vorschau (400 px) gespeichert, sofort mit Nummer. vorgabe = Angaben für alle
// (z. B. der Raum, wenn gerade nach einem Raum gefiltert ist). Gibt zurück, wie viele geklappt haben.
async function fotosSpeichern(dateien, vorgabe, status) {
  let ok = 0, fehler = null;
  status.hidden = false;
  await mitWachSperre(async () => {
    for (const [i, datei] of dateien.entries()) {
      status.textContent = `Fotos speichern: ${i + 1} von ${dateien.length} …`;
      try {
        const img = await loadImage(datei);
        try {
          const foto = await alsJpg(img, 1200), vorschau = await alsJpg(img, 400);
          await addDing({ ...vorgabe, foto, vorschau, ergaenzen: true });
          ok++;
        } finally { URL.revokeObjectURL(img.src); }
      } catch (e) { console.error(e); fehler = e; }
    }
  });
  status.hidden = true;
  if (fehler) fehlerToast(`${dateien.length - ok} von ${dateien.length} Fotos ließen sich nicht speichern`, fehler);
  return ok;
}

/* ---------- „Noch ergänzen“: eine Karte pro neuem Foto ---------- */
function ergaenzenKarte(d, bild, neuZeichnen, entsorgen) {
  let timer = null;
  const speichern = () => updateDing(d.nr, form.get()).catch(e => fehlerToast("Speichern hat nicht geklappt", e));
  const spaeter = () => { clearTimeout(timer); timer = setTimeout(speichern, 400); };
  const sofort = () => { if (timer) { clearTimeout(timer); timer = null; speichern(); } };
  const form = dingFelder(d, spaeter, true);
  entsorgen(form.dispose);
  const img = el("img", { src: bild(d.vorschau), alt: dingName(d) });
  img.onclick = () => zeigeGross(img.src, dingName(d));
  const fertig = el("button", { type: "button", class: "btn primary" }, "✓ Fertig");
  fertig.onclick = async () => {
    clearTimeout(timer); timer = null;
    const w = form.get();
    if (!w.kategorie && !w.name) return toast("Tipp an, was es ist, oder schreib einen Namen.");
    fertig.disabled = true;
    try { await updateDing(d.nr, { ...w, ergaenzen: false }); toast(`${dingNrText(d.nr)} gespeichert`); neuZeichnen(); }
    catch (e) { fertig.disabled = false; fehlerToast("Speichern hat nicht geklappt", e); }
  };
  const weg = el("button", { type: "button", class: "btn" }, "Verwerfen");
  weg.onclick = async () => {
    clearTimeout(timer); timer = null;
    weg.disabled = true;
    try { await updateDing(d.nr, { geloescht: new Date().toISOString() }); toast(`${dingNrText(d.nr)} liegt im Papierkorb`); neuZeichnen(); }
    catch (e) { weg.disabled = false; fehlerToast("Hat nicht geklappt", e); }
  };
  const karte = el("div", { class: "check" },
    el("div", { class: "top" }, img, el("div", {}, el("div", { class: "titel" }, dingNrText(d.nr)), el("div", { class: "hint" }, `Hinzugefügt am ${datumText(d.erstellt)}`))),
    ...form.elements, el("div", { class: "actions" }, weg, fertig));
  // Verlässt sie ein Textfeld (z. B. um bei einer anderen Karte „Fertig“ zu tippen), gleich speichern statt erst nach der Pause
  karte.addEventListener("change", sofort);
  return karte;
}

/* ---------- Übersicht ---------- */
const filter = { kategorie: null, raum: null, suche: "", stand: null }; // pro Sitzung gemerkt (stand: null = im Haushalt, "verkaufen", "verkauft")
const OHNE_RAUM = "ohne Raum";
// Suche: „H12“, „12“ oder „H012“ = Nummer; sonst Wörter, die alle in den Angaben vorkommen müssen (z. B. „lego keller“)
function passtSuche(d, q, kiste = null) {
  q = q.trim().toLowerCase().replace(/^nr\.?\s*/, "");
  if (!q) return true;
  const m = /^h?\s*0*(\d+)$/.exec(q);
  if (m) return d.nr === Number(m[1]);
  const text = [d.kategorie, d.name, d.marke, d.raum, d.ort, d.notiz, d.zustand, d.verliehen?.an, kiste].filter(Boolean).join(" ").toLowerCase();
  return q.split(/\s+/).every(w => text.includes(w));
}
function filterReihe(label, liste, key, wert) {
  const zahl = new Map();
  for (const d of liste) zahl.set(wert(d), (zahl.get(wert(d)) || 0) + 1);
  if (zahl.size < 2 && !filter[key]) return null; // nur, wenn es etwas zu wählen gibt (oder ein Filter aktiv ist)
  return { label, eintraege: [...zahl].sort((a, b) => b[1] - a[1]), key };
}
function renderUebersicht(box, kopf, dinge, bild, nav, neuZeichnen, entsorgen, extra) {
  const kisteVon = kistenNamen(extra.kisten);
  const da = dinge.filter(d => !d.geloescht).sort((a, b) => b.nr - a.nr);
  const offen = da.filter(d => d.ergaenzen).sort((a, b) => a.nr - b.nr), imKorb = dinge.filter(d => d.geloescht).length;
  // Umschalter „Im Haushalt · Zum Verkaufen · Verkauft“ (seit 0.32): Verkauftes ist nicht mehr im Haushalt, nur noch unter „✅ Verkauft“
  const alleFertig = da.filter(d => !d.ergaenzen);
  const STAENDE = { haushalt: ["🏠", "Im Haushalt", alleFertig.filter(d => !istVerkauft(d))], verkaufen: ["💰", "Zum Verkaufen", alleFertig.filter(imVerkauf)],
    verkauft: ["✅", "Verkauft", alleFertig.filter(istVerkauft)], verliehen: ["🤝", "Verliehen", alleFertig.filter(d => d.verliehen && !istVerkauft(d))] };
  if (filter.stand && !STAENDE[filter.stand]) filter.stand = null;
  const stand = filter.stand || "haushalt", fertige = STAENDE[stand][2];
  // Nur Bereiche mit etwas darin (und den gerade gewählten); so viele Spalten wie Knöpfe
  const bereiche = Object.entries(STAENDE).filter(([k, [, , l]]) => k === "haushalt" || l.length || k === stand);
  const umschalter = bereiche.length > 1 ? el("div", { class: "chips umschalter", style: `grid-template-columns:repeat(${bereiche.length},minmax(0,1fr))` },
    ...bereiche.map(([k, [zeichen, wort, liste]]) => {
        const b = el("button", { type: "button", class: "chip", "aria-label": `${wort}: ${anzahl(liste.length)}`,
          onclick: () => { if (k !== stand) { filter.stand = k === "haushalt" ? null : k; filter.kategorie = filter.raum = null; neuZeichnen(); } } },
          el("span", { class: "zahl" }, `${zeichen} ${liste.length}`), el("span", { class: "wort" }, wort));
        b.setAttribute("aria-pressed", k === stand);
        return b;
    })) : null;
  const summe = (l, f) => Math.round(l.reduce((s, d) => s + (d[f] || 0), 0) * 100) / 100;
  const standZeile = stand === "verkaufen" ? (() => {
      const bei = fertige.filter(d => d.verkauf === EINGESTELLT), wollen = fertige.length - bei.length, s = summe(bei, "preis");
      return [wollen ? `Will ich verkaufen: ${wollen}` : null, bei.length ? `Eingestellt: ${bei.length}${s ? ` (zusammen ${preisText(s)})` : ""}` : null].filter(Boolean).join(" · ");
    })()
    : stand === "verkauft" ? `${anzahl(fertige.length)} verkauft${fertige.some(d => d.erloes != null) ? `, zusammen ${preisText(summe(fertige, "erloes"))}` : ""}.` : null;

  // Hinzufügen: mehrere Fotos auf einmal
  const status = el("p", { class: "hint", hidden: true });
  const eingabe = el("input", { type: "file", accept: "image/*", multiple: true, hidden: true });
  eingabe.onchange = async () => {
    const dateien = [...eingabe.files]; eingabe.value = "";
    if (!dateien.length) return;
    const n = await fotosSpeichern(dateien, filter.raum && filter.raum !== OHNE_RAUM ? { raum: filter.raum } : {}, status);
    if (n) toast(n === 1 ? "1 Foto gespeichert – jetzt ergänzen, was es ist" : `${n} Fotos gespeichert – jetzt ergänzen, was sie sind`);
    neuZeichnen();
  };
  const hinzu = el("div", { class: "panel" },
    mitInfo(el("strong", {}, "Sachen hinzufügen"),
      "Fotografiere ein Ding nach dem anderen, am besten einzeln vor ruhigem Hintergrund. Du kannst auch mehrere Fotos auf einmal auswählen.",
      "Jedes Foto wird gleich gespeichert und bekommt eine feste Nummer (H001, H002 …). Danach tippst du unter „Noch ergänzen“ an, was es ist, und gibst ihm einen kurzen Namen.",
      "Die App erkennt Haushaltsdinge noch nicht von selbst. Die Fotos bleiben auf deinem Handy."),
    el("div", { class: "actions" }, el("label", { class: "btn primary datei" }, "＋ Fotos auswählen", eingabe)),
    filter.raum && filter.raum !== OHNE_RAUM ? el("p", { class: "hint" }, `Neue Fotos bekommen gleich den Raum „${filter.raum}“ (der Filter unten ist an).`) : null,
    status);

  // Wunschliste und Umzugskisten (seit 0.32) als zwei kleine Kacheln
  const klein = (name, stand, onclick) => el("button", { type: "button", onclick }, el("span", { class: "name" }, name), el("span", { class: "stand" }, stand));
  const kistenZu = (extra.kisten || []).filter(k => k.zu).length, kistenAlle = (extra.kisten || []).length;
  const mehr = el("div", { class: "neben vier haushalt-neben" },
    klein("📝 Wunschliste", extra.wunschOffen ? `${extra.wunschOffen} offen` : "leer", () => nav.go({ v: "wunsch" })),
    klein("📦 Umzugskisten", kistenAlle ? `${kistenZu} von ${kistenAlle} zu` : "keine", () => nav.go({ v: "kisten" })));

  // Noch ergänzen
  const ergaenzen = offen.length ? el("div", {},
    el("h3", { class: "ding-abschnitt" }, `Noch ergänzen (${offen.length})`),
    ...offen.map(d => ergaenzenKarte(d, bild, neuZeichnen, entsorgen))) : null;

  // Suche und Filter (nur über die fertigen)
  const reihen = [filterReihe("Was", fertige, "kategorie", d => d.kategorie || "Sonstiges"),
    filterReihe("Wo", fertige, "raum", d => d.raum || OHNE_RAUM)].filter(Boolean);
  const gefiltert = fertige.filter(d => (!filter.kategorie || (d.kategorie || "Sonstiges") === filter.kategorie) && (!filter.raum || (d.raum || OHNE_RAUM) === filter.raum));
  const filterEl = reihen.length ? el("div", { class: "filter" }, ...reihen.map(r => {
    const alle = el("button", { type: "button", class: "chip", onclick: () => { filter[r.key] = null; neuZeichnen(); } }, "Alle");
    alle.setAttribute("aria-pressed", !filter[r.key]);
    return field(r.label, null, el("div", { class: "chips" }, alle, ...r.eintraege.map(([k, n]) => {
      const b = el("button", { type: "button", class: "chip", onclick: () => { filter[r.key] = filter[r.key] === k ? null : k; neuZeichnen(); } }, `${k} (${n})`);
      b.setAttribute("aria-pressed", filter[r.key] === k);
      return b;
    })));
  })) : null;
  const kachel = d => {
    const zeichen = verkaufZeichen(d) || (d.verliehen ? "🤝" : null);
    const unten = stand === "verliehen" ? verliehenKurz(d) : stand !== "haushalt" ? verkaufKurz(d) : kisteVon.get(d.nr) ? "📦 " + kisteVon.get(d.nr) : woText(d) ? "📍 " + woText(d) : null;
    const b = el("button", { type: "button", class: "teil", onclick: () => nav.go({ v: "ding", nr: d.nr }) },
      el("span", { class: "bild" }, el("img", { src: bild(d.vorschau), alt: dingName(d), loading: "lazy" }), el("span", { class: "plakette" }, dingNrText(d.nr)),
        zeichen ? el("span", { class: "nicht", title: verkaufKurz(d) }, zeichen) : null),
      el("span", { class: "text" }, dingTitel(d)), unten ? el("span", { class: "rest" }, unten) : null);
    b.dataset.nr = d.nr;
    return b;
  };
  const grid = el("div", { class: "grid" }, ...gefiltert.map(kachel));
  const keinTreffer = el("p", { class: "hint" }, "Nichts gefunden.");
  const suche = el("input", { type: "search", class: "suche", value: filter.suche, placeholder: "Suchen, z. B. Lampe oder H012", "aria-label": "Suchen", autocomplete: "off", enterKeyHint: "search" });
  const nachNr = new Map(gefiltert.map(d => [d.nr, d]));
  // Beim Tippen nur ein- und ausblenden (neu zeichnen würde die Tastatur schließen)
  const suchen = () => {
    filter.suche = suche.value;
    let n = 0;
    for (const k of grid.children) { const nr = Number(k.dataset.nr), ok = passtSuche(nachNr.get(nr), filter.suche, kisteVon.get(nr)); k.hidden = !ok; if (ok) n++; }
    keinTreffer.hidden = n > 0 || !gefiltert.length;
  };
  suche.oninput = suchen; suche.onkeydown = e => { if (e.key === "Enter") suche.blur(); };
  suchen();
  const leer = !da.length ? "Noch nichts hier. Tippe oben auf „＋ Fotos auswählen“."
    : !fertige.length ? (stand === "verkaufen" ? "Hier ist nichts. Ein Ding kommt hierher, wenn du bei ihm „💰 Will ich verkaufen“ antippst."
      : stand === "verkauft" ? "Noch nichts verkauft." : stand === "verliehen" ? "Gerade ist nichts verliehen." : null)
    : !gefiltert.length ? "Mit diesem Filter gibt es hier nichts." : null;
  const korbKnopf = imKorb ? el("div", { class: "actions" }, el("button", { type: "button", class: "btn", onclick: () => nav.go({ v: "dingKorb" }) }, `🗑 Papierkorb (${imKorb})`)) : null;
  const imHaushalt = da.filter(d => !istVerkauft(d)).length;
  fill(box, kopf("🏠 Sachen im Haushalt", imHaushalt ? anzahl(imHaushalt) : null), hinzu, mehr, ergaenzen,
    alleFertig.length ? el("h3", { class: "ding-abschnitt" }, offen.length ? "Fertig eingetragen" : "Alles") : null,
    umschalter, standZeile ? el("p", { class: "hint aussortiert-unter" }, standZeile) : null,
    stand === "verkauft" && fertige.length ? el("div", { class: "actions" }, el("button", { type: "button", class: "btn", onclick: () => nav.go({ v: "verkaeufe" }) }, "💶 Zur Verkaufs-Übersicht")) : null,
    fertige.length ? suche : null, filterEl, grid, fertige.length ? keinTreffer : null, leer ? el("p", { class: "hint" }, leer) : null, korbKnopf);
}

/* ---------- Ein Ding ---------- */
function renderDing(box, kopf, d, foto, bild, nav, neuZeichnen, entsorgen, extra) {
  const kiste = (extra.kisten || []).find(k => k.nrs.includes(d.nr));
  const gross = el("img", { class: "gross", src: bild(foto || d.vorschau), alt: dingName(d) });
  gross.onclick = () => zeigeGross(gross.src, dingName(d));
  const zeile = (k, v) => v ? [el("dt", {}, k), el("dd", {}, v)] : [];
  const angaben = el("dl", { class: "angaben" },
    ...zeile("Was", d.kategorie || "noch nicht gewählt"), ...zeile("Name", d.name), ...zeile("Marke", d.marke),
    ...zeile("Wo", woText(d) || "noch nicht eingetragen"), ...zeile("Umzug", kiste ? `📦 in „${kiste.name}“` : null), ...zeile("Anzahl", d.menge ? `${d.menge} Stück` : null), ...zeile("Zustand", d.zustand),
    ...zeile("Gekauft für", d.kaufpreis != null ? preisText(d.kaufpreis) : null), ...zeile("Notiz", d.notiz), ...zeile("Hinzugefügt", datumText(d.erstellt)));
  const inhalt = el("div", { class: "panel" }, angaben);
  const aendern = el("button", { type: "button", class: "btn" }, "Angaben ändern");
  aendern.onclick = () => {
    const form = dingFelder(d);
    entsorgen(form.dispose);
    const start = JSON.stringify(form.get());
    nav.schutz(() => JSON.stringify(form.get()) !== start);
    const msg = el("p", { class: "hint" });
    const fertig = () => { nav.frei(); neuZeichnen(); };
    const speichern = el("button", { type: "button", class: "btn primary" }, "Speichern");
    speichern.onclick = async () => {
      const f = form.fehler();
      if (f) { msg.textContent = f; return; }
      speichern.disabled = true;
      try { await updateDing(d.nr, { ...form.get(), ergaenzen: false }); toast("Gespeichert"); fertig(); }
      catch (e) { speichern.disabled = false; fehlerToast("Speichern hat nicht geklappt", e); }
    };
    inhalt.replaceChildren(...form.elements, msg, el("div", { class: "actions" }, el("button", { type: "button", class: "btn", onclick: fertig }, "Abbrechen"), speichern));
    aktionen.hidden = true;
  };
  const korb = el("button", { type: "button", class: "btn" }, d.geloescht ? "Wiederherstellen" : "In den Papierkorb");
  korb.onclick = async () => {
    korb.disabled = true;
    try {
      if (d.geloescht) { await updateDing(d.nr, { geloescht: null }); toast(`${dingNrText(d.nr)} ist wieder da`); neuZeichnen(); }
      else { await updateDing(d.nr, { geloescht: new Date().toISOString() }); toast(`${dingNrText(d.nr)} liegt jetzt im Papierkorb`); nav.back(); }
    } catch (e) { korb.disabled = false; fehlerToast("Hat nicht geklappt", e); }
  };
  const aktionen = el("div", { class: "actions wrap" }, d.geloescht ? null : aendern, korb);
  // Verkaufen (seit 0.32, wie bei der Kleidung) und der Text für Vinted, Kleinanzeigen oder eBay
  const verkauf = d.geloescht ? null : el("div", { class: "panel" }, verkaufFeld(d, () => neuZeichnen(), { speichern: updateDing, name: dingNrText, ding: true }));
  const text = d.geloescht || istVerkauft(d) ? null : el("div", { class: "actions wrap" },
    el("button", { type: "button", class: imVerkauf(d) ? "btn primary" : "btn", onclick: () => nav.go({ v: "dingText", nr: d.nr }) }, "🏷 Verkaufstext"));
  const beimVerkauf = imVerkauf(d) || istVerkauft(d);
  // Verliehen an … (seit 0.32): Name eintippen, „Zurückbekommen“ nimmt es wieder weg
  let verliehen = null;
  if (!d.geloescht && !istVerkauft(d)) {
    const kasten = el("div", {});
    if (d.verliehen) {
      const zurueck = el("button", { type: "button", class: "btn primary" }, "✓ Zurückbekommen");
      zurueck.onclick = async () => {
        zurueck.disabled = true;
        try { await updateDing(d.nr, { verliehen: null }); toast(`${dingNrText(d.nr)} ist wieder da`); neuZeichnen(); }
        catch (e) { zurueck.disabled = false; fehlerToast("Speichern hat nicht geklappt", e); }
      };
      fill(kasten, field("Verliehen", `🤝 An ${d.verliehen.an} verliehen, ${seitText(d.verliehen.seit)} (${datumText(d.verliehen.seit)}).`, el("div", { class: "actions" }, zurueck)));
    } else {
      const auf = el("button", { type: "button", class: "btn" }, "🤝 Verliehen an …");
      auf.onclick = () => {
        const name = el("input", { type: "text", class: "feld-eingabe", maxLength: MAX_AN, placeholder: "z. B. Nachbarin, Lena", autocomplete: "off", enterKeyHint: "done", "aria-label": "An wen verliehen" });
        const ok = el("button", { type: "button", class: "btn primary" }, "Speichern");
        ok.onclick = async () => {
          const an = clean(name.value).slice(0, MAX_AN);
          if (!an) return toast("Bitte eintippen, an wen.");
          ok.disabled = true;
          try { await updateDing(d.nr, { verliehen: { an, seit: new Date().toISOString() } }); toast(`An ${an} verliehen`); neuZeichnen(); }
          catch (e) { ok.disabled = false; fehlerToast("Speichern hat nicht geklappt", e); }
        };
        name.onkeydown = e => { if (e.key === "Enter") ok.click(); };
        fill(kasten, field("Verliehen an", "Der Name bleibt nur auf deinem Handy (und in deiner Sicherung).", name),
          el("div", { class: "actions" }, el("button", { type: "button", class: "btn", onclick: () => neuZeichnen() }, "Abbrechen"), ok));
        name.focus();
      };
      fill(kasten, el("div", { class: "actions" }, auf));
    }
    verliehen = el("div", { class: "panel" }, kasten);
  }
  fill(box, kopf(dingTitel(d), d.geloescht ? `Liegt im Papierkorb (${nochTage(d)})` : istVerkauft(d) ? "✅ Verkauft – nicht mehr im Haushalt"
      : d.ergaenzen ? "Noch nicht fertig eingetragen" : null),
    gross, text, beimVerkauf ? verkauf : null, d.verliehen ? verliehen : null, inhalt, d.verliehen ? null : verliehen, beimVerkauf ? null : verkauf,
    kiste ? el("div", { class: "actions" }, el("button", { type: "button", class: "btn", onclick: () => nav.go({ v: "kiste", id: kiste.id }) }, `📦 Zu „${kiste.name}“`)) : null, aktionen);
}

/* ---------- Papierkorb ---------- */
function renderKorb(box, kopf, dinge, bild, nav, neuZeichnen) {
  const weg = dinge.filter(d => d.geloescht).sort((a, b) => b.geloescht.localeCompare(a.geloescht));
  const leeren = el("button", { type: "button", class: "btn" }, "Papierkorb leeren");
  leeren.onclick = async () => {
    if (!confirm(`${anzahl(weg.length)} endgültig löschen?\n\nDas kann man nicht rückgängig machen. Die Nummern werden nicht neu vergeben.`)) return;
    try { await purgeDinge(weg.map(d => d.nr)); toast("Papierkorb geleert"); nav.back(); } catch (e) { fehlerToast("Hat nicht geklappt", e); }
  };
  const kacheln = weg.map(d => {
    const zurueck = el("button", { type: "button", class: "btn klein" }, "Wiederherstellen");
    zurueck.onclick = async () => {
      zurueck.disabled = true;
      try { await updateDing(d.nr, { geloescht: null }); toast(`${dingNrText(d.nr)} ist wieder da`); neuZeichnen(); }
      catch (e) { zurueck.disabled = false; fehlerToast("Hat nicht geklappt", e); }
    };
    const k = el("button", { type: "button", class: "teil", onclick: () => nav.go({ v: "ding", nr: d.nr }) },
      el("span", { class: "bild" }, el("img", { src: bild(d.vorschau), alt: dingName(d), loading: "lazy" }), el("span", { class: "plakette" }, dingNrText(d.nr))),
      el("span", { class: "text" }, dingTitel(d)), el("span", { class: "rest" }, nochTage(d)));
    return el("div", { class: "korb-teil" }, k, zurueck);
  });
  fill(box, kopf("Papierkorb (Haushalt)", `Gelöschte Dinge bleiben ${KORB_TAGE} Tage hier und behalten ihre Nummer. Danach werden sie endgültig gelöscht.`),
    el("div", { class: "grid" }, ...kacheln),
    weg.length ? el("div", { class: "actions" }, leeren) : el("p", { class: "hint" }, "Der Papierkorb ist leer."));
}

/* ---------- Einstieg (schrank.js) ----------
   s = Ansicht ({ v: "haushalt" | "ding" | "dingKorb", nr }), kopf(titel, unter) aus schrank.js, bild(blob) = Bild-Adresse,
   nav = { go, back, schutz(geaendert), frei() } (schutz: „Änderungen verwerfen?“ beim Verlassen von „Angaben ändern“) */
export async function renderHaushalt(box, kopf, s, bild, nav, neuZeichnen, extra = {}) {
  const dinge = await allDinge();
  merkeMarken(dinge);
  const weg = [];
  box.dispose = () => { weg.forEach(f => f()); weg.length = 0; };
  const entsorgen = f => weg.push(f);
  if (s.v === "ding") {
    const d = dinge.find(x => x.nr === s.nr);
    if (!d) return nav.back();
    return renderDing(box, kopf, d, await getDingFoto(d.nr), bild, nav, neuZeichnen, entsorgen, extra);
  }
  if (s.v === "dingText") {
    const d = dinge.find(x => x.nr === s.nr);
    if (!d || d.geloescht) return nav.back();
    return renderDingText(box, kopf("🏷 Verkaufstext", dingTitel(d)), d, bild, felder => updateDing(d.nr, felder),
      verkaufFeld(d, null, { speichern: updateDing, name: dingNrText, ding: true }));
  }
  if (s.v === "dingKorb") return renderKorb(box, kopf, dinge, bild, nav, neuZeichnen);
  return renderUebersicht(box, kopf, dinge, bild, nav, neuZeichnen, entsorgen, extra);
}
// Dinge, die länger als 30 Tage im Papierkorb liegen, endgültig löschen (beim Start)
export async function dingeAufraeumen() {
  const alt = (await allDinge()).filter(d => d.geloescht && Date.now() - Date.parse(d.geloescht) >= KORB_TAGE * TAG);
  await purgeDinge(alt.map(d => d.nr));
}
