// „🧳 Koffer packen“ (seit 0.28, Wunsch 18.11.2026): Reise antippen → die App packt eine kleine Auswahl, die sich gut kombinieren
// lässt (regeln.js kofferPacken), oder der Chat (Anfrage mit eigenem Text, Antwort als Packliste übernehmen). Dann eine Liste zum
// Abhaken, auch über mehrere Tage, dazu ein Outfit-Vorschlag pro Tag und Dinge, die nicht im Kleiderschrank sind (Ladekabel …).
// Seit 0.28 (Wunsch 18.11.2026, „Kreta Sommer 2026“): mehrere Reisen mit Namen, jede mit eigener Packliste, eigenen Haken und eigener
// Chat-Antwort. Gespeichert in meta „reisen“ und in der Sicherung (mit Namen sind sie etwas zum Behalten, z. B. als Vorlage fürs nächste Jahr).
// Texte nur per textContent/DOM, nie per innerHTML (Name und eigene Einträge sind eingetippter Text).
import { el, fill, toast, fehlerToast, field, choice, clean, mitInfo, info, beschreibung } from "./ui.js?v=21";
import { getMeta, setMeta, nrText } from "./speicher.js?v=12";
import { kandidaten, kofferPacken, kofferTage, kofferVorschlaege, kofferExtras, kofferMenge, platzVon, KOFFER_ANLAESSE, KOFFER_TAGE, KOFFER_PLATZ_NAME, TEMPERATUREN, WETTER } from "./regeln.js?v=23";
import { chatgptPanel, chatMerkLeeren } from "./chatgpt.js?v=25";
import { miniKachel } from "./passt.js?v=31";
import { stilAktuell } from "./stil.js?v=22";

const WASCHEN = "Ich kann waschen", HAND = "Nur Handgepäck";
let popNr = null; // Nummer des gerade abgehakten Teils (ploppt beim nächsten Zeichnen kurz auf, seit 0.37)
const REIHE = ["oben", "unten", "ganz", "lage", "schuh", "tasche", "zubehoer", "bade", "schmuck", "guertel"];
const MAX_EXTRAS = 40, MAX_EXTRA_TEXT = 60, MAX_TEILE = 80, MAX_REISEN = 30, MAX_NAME = 40, MAX_MENGE = 99;
// Einträge bei „Außerdem einpacken“: { text, gepackt, menge (1–99 oder null), selbst (Anzahl selbst eingestellt), eigen (selbst eingetragen) }
const neueExtras = e => kofferExtras(e).map(text => ({ text, gepackt: false, menge: kofferMenge(text, e), selbst: false, eigen: false }));
// Seit 0.31 (Durchsicht 19.11.2026): Ändert sich die Reise, passen sich die Einträge der App an. Vorher blieb z. B. „Unterwäsche 6×“
// stehen, auch nach dem Wechsel auf 10 Tage ohne Waschen und neuem Packen. Jetzt: Die Anzahl bei Unterwäsche und Socken folgt der
// Reise (außer sie hat sie selbst eingestellt), neue Standard-Einträge kommen dazu (z. B. Regenschirm bei Regen), Standard-Einträge,
// die nicht mehr passen, gehen weg, solange sie nicht abgehakt sind. Selbst eingetragene bleiben immer.
function extrasAnpassen(liste, vorher, nachher) {
  const alt = new Set(kofferExtras(vorher)), neu = kofferExtras(nachher), bleibt = new Set(neu), da = new Set(liste.map(x => x.text));
  const out = liste.filter(x => x.eigen || x.gepackt || !alt.has(x.text) || bleibt.has(x.text))
    .map(x => { const n = kofferMenge(x.text, nachher); return !x.selbst && n !== null ? { ...x, menge: n } : x; });
  for (const text of neu) if (!alt.has(text) && !da.has(text) && out.length < MAX_EXTRAS) out.push({ text, gepackt: false, menge: kofferMenge(text, nachher), selbst: false, eigen: false });
  return out;
}
const leer = () => ({ eingaben: { tage: null, temperatur: null, wetter: [], anlaesse: [], waschen: false, handgepaeck: false },
  nrs: null, gepackt: [], tage: null, luecken: [], tipps: [], extras: null, quelle: null, gepacktFuer: null });
let reisen = null;           // [{ id, name, erstellt, geaendert, ...wie leer() }] aus meta „reisen“, beim ersten Öffnen geladen
let aendern = false;         // „✏️ Teile ändern“ ist an (pro Sitzung)
let reiseOffen = false, tageOffen = false, chatOffen = false;
const neueId = () => "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const ID = /^r[a-z0-9]{1,40}$/;
// Eine Reise ohne Namen, ohne Angaben und ohne Packliste (z. B. „＋ Neue Reise“ angetippt und gleich wieder zurück) zählt nicht
const leerReise = r => !r.name && r.nrs === null && !r.extras && !r.eingaben.tage && !r.eingaben.temperatur && !r.eingaben.wetter.length && !r.eingaben.anlaesse.length;

/* ---------- Speichern und Laden ---------- */
const zahlen = (v, max) => Array.isArray(v) ? [...new Set(v.filter(n => Number.isInteger(n) && n > 0 && n <= 999999))].slice(0, max) : [];
const texte = (v, erlaubt) => Array.isArray(v) ? v.filter(x => erlaubt.includes(x)) : [];
// Nur bekannte Felder (der Speicher gehört zwar der App, aber lieber vorsichtig: Was kaputt ist, fällt weg)
function pruefen(o) {
  const k = leer();
  if (!o || typeof o !== "object") return k;
  const e = o.eingaben && typeof o.eingaben === "object" ? o.eingaben : {};
  k.eingaben = { tage: KOFFER_TAGE.includes(e.tage) ? e.tage : null, temperatur: Object.hasOwn(TEMPERATUREN, e.temperatur) ? e.temperatur : null,
    wetter: texte(e.wetter, WETTER), anlaesse: texte(e.anlaesse, KOFFER_ANLAESSE), waschen: e.waschen === true, handgepaeck: e.handgepaeck === true };
  if (Array.isArray(o.nrs)) k.nrs = zahlen(o.nrs, MAX_TEILE);
  k.gepackt = zahlen(o.gepackt, MAX_TEILE);
  // Titel bis 60 Zeichen (seit 0.30, vorher 30: „Tag 3 (Sightseeing & Abend im“ war abgeschnitten)
  if (Array.isArray(o.tage)) k.tage = o.tage.slice(0, 30).map(t => ({ titel: typeof t?.titel === "string" ? clean(t.titel).slice(0, 60) : null, nrs: zahlen(t?.nrs, 12) })).filter(t => t.titel && t.nrs.length);
  k.luecken = Array.isArray(o.luecken) ? o.luecken.filter(x => typeof x === "string").slice(0, 10).map(x => x.slice(0, 200)) : [];
  k.tipps = Array.isArray(o.tipps) ? o.tipps.filter(x => typeof x === "string").slice(0, 6).map(x => x.slice(0, 200)) : [];
  // menge seit 0.30: Zahl 1–99 oder null (keine Anzahl). Ältere Reisen kennen das Feld nicht: Dort bekommen Unterwäsche und Socken den Vorschlag.
  if (Array.isArray(o.extras)) k.extras = o.extras.filter(x => typeof x?.text === "string" && clean(x.text)).slice(0, MAX_EXTRAS)
    .map(x => { const text = clean(x.text).slice(0, MAX_EXTRA_TEXT);
      return { text, gepackt: x.gepackt === true, menge: Number.isInteger(x.menge) && x.menge >= 1 && x.menge <= MAX_MENGE ? x.menge : x.menge === undefined ? kofferMenge(text, k.eingaben) : null,
        selbst: x.selbst === true, eigen: x.eigen === true }; });
  k.quelle = o.quelle === "chat" ? "chat" : o.quelle === "app" ? "app" : null;
  k.gepacktFuer = typeof o.gepacktFuer === "string" ? o.gepacktFuer.slice(0, 1000) : null;
  return k;
}
const zeit = v => typeof v === "string" && v.length < 40 && !isNaN(Date.parse(v)) ? new Date(v).toISOString() : null;
// Liste der Reisen prüfen, auch beim Laden einer Sicherung (zip-ansicht.js). gibtEs = Set der Nummern, die es gibt (sonst alle lassen)
export function reisenPruefen(liste, gibtEs = null) {
  const ids = new Set(), jetzt = new Date().toISOString();
  return (Array.isArray(liste) ? liste : []).slice(0, MAX_REISEN).map(o => {
    const r = pruefen(o);
    let id = typeof o?.id === "string" && ID.test(o.id) ? o.id : neueId();
    while (ids.has(id)) id = neueId();
    ids.add(id);
    const da = n => !gibtEs || gibtEs.has(n);
    if (r.nrs) r.nrs = r.nrs.filter(da);
    r.gepackt = r.gepackt.filter(n => da(n) && (!r.nrs || r.nrs.includes(n))); // Haken nur für Teile auf der Liste
    if (r.tage) r.tage = r.tage.map(t => ({ ...t, nrs: t.nrs.filter(da) })).filter(t => t.nrs.length);
    return { id, name: typeof o?.name === "string" ? clean(o.name).slice(0, MAX_NAME) || null : null, erstellt: zeit(o?.erstellt) || jetzt, geaendert: zeit(o?.geaendert) || jetzt, ...r };
  }).filter(r => !leerReise(r));
}
async function laden() {
  if (reisen) return reisen;
  try {
    let roh = await getMeta("reisen");
    // Vor den Namen gab es (nur in der Testkopie) einen einzigen Koffer in meta „koffer“: wird zur ersten Reise
    if (!Array.isArray(roh)) { const alt = await getMeta("koffer"); roh = alt && typeof alt === "object" ? [alt] : []; }
    reisen = reisenPruefen(roh);
  } catch (e) { console.error(e); reisen = []; }
  return reisen;
}
// r = die geänderte Reise (bekommt den Zeitpunkt, die Liste „Deine Reisen“ sortiert danach).
// merken = zählt für „Seit deiner letzten Sicherung …“ (meta „sonstGeaendert“, seit 0.31, Durchsicht 19.11.2026: Reisen stehen in der
// Sicherung, aber Änderungen daran meldete die App nicht). Nur Abhaken zählt nicht, sonst wäre nach jedem Häkchen eine Sicherung „fällig“.
const speichern = (r = null, merken = true) => {
  const jetzt = new Date().toISOString();
  if (r) r.geaendert = jetzt;
  return Promise.all([setMeta("reisen", reisen.filter(x => !leerReise(x))), merken ? setMeta("sonstGeaendert", jetzt) : null])
    .catch(e => fehlerToast("Speichern hat nicht geklappt", e));
};
const eingabenSchluessel = e => JSON.stringify([e.tage, e.temperatur, e.wetter, e.anlaesse, e.waschen, e.handgepaeck]);
const fuerText = e => [e.tage && `${e.tage} ${e.tage === 1 ? "Tag" : "Tage"}`, e.temperatur, ...e.wetter, ...e.anlaesse].filter(Boolean).join(" · ");
function neueReise() {
  if (reisen.filter(r => !leerReise(r)).length >= MAX_REISEN) { toast(`Höchstens ${MAX_REISEN} Reisen. Lösch zuerst eine alte.`); return null; }
  const jetzt = new Date().toISOString(), r = { id: neueId(), name: null, erstellt: jetzt, geaendert: jetzt, ...leer() };
  reisen.unshift(r);
  aendern = false; reiseOffen = false; tageOffen = false; chatOffen = false;
  return r;
}

// „Outfit pro Tag“ der App nur neu rechnen, wenn sich Packliste, Teile oder Reise ändern (seit 0.31, Durchsicht 19.11.2026: vorher bei
// jedem Häkchen; bei sehr langen Listen dauerte das am PC fast 2 Sekunden)
let tageMerk = { schluessel: null, plan: [] };
function tageVon(teile, e, mitStil) {
  const s = JSON.stringify([teile.map(t => [t.nr, t.geaendert || ""]), eingabenSchluessel(e), mitStil.mode]);
  if (tageMerk.schluessel !== s) tageMerk = { schluessel: s, plan: kofferTage(teile, e, mitStil) };
  return tageMerk.plan;
}

/* ---------- Ansicht ---------- */
// id = die geöffnete Reise (ohne id: Liste „Deine Reisen“). kopf(titel, unter) baut den Kopf mit „‹ Zurück“ (schrank.js).
// bild(blob) = Bild-Adresse (schrank.js gibt sie beim nächsten Zeichnen frei), oeffnen(nr) = Teil ansehen, nav = { go, ersetze, back }
export async function renderKoffer(box, kopf, id, items, stil, bild, oeffnen, neuZeichnen, nav) {
  await laden();
  if (!id) return renderUebersicht(box, kopf, items, bild, nav);
  const koffer = reisen.find(r => r.id === id);
  if (!koffer) return nav.ersetze({ v: "koffer" });
  const e = koffer.eingaben, pool = kandidaten(items), nachNr = new Map(items.map(t => [t.nr, t]));
  const mitStil = { mode: stilAktuell(stil).mode };
  const gepackt = koffer.nrs !== null;
  const aenderung = felder => {
    const vorher = { ...e };
    Object.assign(e, felder);
    if (koffer.extras) koffer.extras = extrasAnpassen(koffer.extras, vorher, e);
    speichern(koffer); neuZeichnen();
  };
  // Beim Packen (App oder Chat): vorhandene Einträge behalten, Anzahlen zur jetzigen Reise (ältere Reisen aus 0.30 hatten evtl. alte Zahlen)
  const extrasJetzt = () => koffer.extras ? extrasAnpassen(koffer.extras, e, e) : neueExtras(e);

  // --- Die Reise ---
  const einer = (werte, wert, setzen) => choice({ options: werte, selected: wert ? [wert] : [], onChange: sel => setzen(sel[0] || null) }).el;
  const sonst = choice({ options: [WASCHEN, HAND], selected: [e.waschen && WASCHEN, e.handgepaeck && HAND].filter(Boolean), max: 0,
    onChange: sel => aenderung({ waschen: sel.includes(WASCHEN), handgepaeck: sel.includes(HAND) }) });
  const packKnopf = el("button", { type: "button", class: "btn primary" }, gepackt ? "🧳 Neu von der App packen lassen" : "🧳 Von der App packen lassen");
  packKnopf.onclick = () => {
    if (!e.tage) return toast("Tippe zuerst an, wie viele Tage du unterwegs bist.");
    if (!pool.length) return toast("Sobald du Kleidung gespeichert hast, geht es hier los.");
    if (gepackt && !confirm("Neu packen?\n\nDie Packliste wird neu zusammengestellt. Teile, die wieder dabei sind, bleiben abgehakt.")) return;
    const r = kofferPacken(e, pool, mitStil);
    if (!r.nrs.length) return toast("Dafür passt noch nichts aus deinem Kleiderschrank.");
    Object.assign(koffer, { nrs: r.nrs, gepackt: koffer.gepackt.filter(n => r.nrs.includes(n)), tage: null, luecken: r.luecken, tipps: r.tipps,
      extras: extrasJetzt(), quelle: "app", gepacktFuer: eingabenSchluessel(e) });
    reiseOffen = false; aendern = false; speichern(koffer);
    toast(`${r.nrs.length} Teile eingepackt – jetzt abhaken, was im Koffer ist`);
    neuZeichnen();
  };
  // Name der Reise (Wunsch 18.11.2026): gespeichert beim Verlassen des Felds; steht dann oben als Überschrift und in der Chat-Anfrage
  const name = el("input", { type: "text", class: "feld-eingabe", maxLength: MAX_NAME, value: koffer.name || "", placeholder: "z. B. Kreta Sommer 2026",
    autocomplete: "off", enterKeyHint: "done", "aria-label": "Name der Reise" });
  name.onkeydown = ev => { if (ev.key === "Enter") name.blur(); };
  name.onchange = () => { koffer.name = clean(name.value).slice(0, MAX_NAME) || null; speichern(koffer); neuZeichnen(); };
  const reiseInhalt = [
    field("Name der Reise", "freiwillig", name),
    field("Wie viele Tage?", null, einer(KOFFER_TAGE.map(String), e.tage ? String(e.tage) : null, x => aenderung({ tage: x ? Number(x) : null }))),
    field("Temperatur", "ungefähr, am Reiseziel", einer(Object.keys(TEMPERATUREN), e.temperatur, x => aenderung({ temperatur: x }))),
    field("Wetter", "Mehrere möglich.", choice({ options: WETTER, selected: e.wetter, max: 0, onChange: sel => aenderung({ wetter: sel }) }).el),
    field("Was hast du vor?", "Mehrere möglich.", choice({ options: KOFFER_ANLAESSE, selected: e.anlaesse, max: 0, onChange: sel => aenderung({ anlaesse: sel }) }).el,
      "Jede Unternehmung bekommt mindestens ein passendes Outfit. Ohne Angabe packt die App für den Alltag."),
    field("Sonst noch", "freiwillig", sonst.el, ["Mit Waschen packt die App höchstens Sachen für 4 Tage.", "Mit Handgepäck packt sie weniger: weniger Oberteile, höchstens 2 Paar Schuhe."]),
    el("div", { class: "actions" }, packKnopf),
    mitInfo(el("p", { class: "hint" }, "Die App kennt nur deine Angaben, nicht die Fotos."),
      "Darum packt sie solide, aber schlicht: Teile, die farblich und von der Schick-Stufe gut zusammenpassen, zum Wetter und zu dem, was du vorhast.",
      "Kreativere Ideen (und eigene Wünsche in deinen Worten) bekommst du über ChatGPT oder Gemini weiter unten.")];
  const fuer = fuerText(e);
  let reise;
  if (gepackt) {
    // Rechts nur „ändern“: Die Angaben stehen schon oben unter dem Namen. Vorher stand hier der ganze Text („5 Tage · unter 5° · …“),
    // der nicht umbrach und die Seite breiter machte (iPhone-Test 18.11.2026: Seite ließ sich nach links wischen).
    reise = el("details", { class: "klappe" }, el("summary", {}, el("span", {}, "Deine Reise"), el("span", { class: "klappe-zahl" }, "ändern")), el("div", { class: "panel" }, ...reiseInhalt));
    reise.open = reiseOffen; reise.ontoggle = () => { reiseOffen = reise.open; };
  } else reise = el("div", { class: "panel" }, el("strong", {}, "Deine Reise"), ...reiseInhalt);

  // --- Mit ChatGPT oder Gemini ---
  // id: Jede Reise hat ihre eigene Chat-Antwort; name kommt mit in die Anfrage („Reise: Kreta Sommer 2026“)
  const frage = { koffer: { ...e, id: koffer.id, name: koffer.name }, uebernehmen: (nrs, tage) => {
    const neu = nrs.filter(n => nachNr.has(n)).slice(0, MAX_TEILE), drin = new Set(neu);
    // Tage nur mit Teilen, die auch in der Packliste sind (seit 0.31: Stand in einem Tag ein Teil aus dem Papierkorb, ersetzte die App
    // vorher alle Tage aus dem Chat still durch ihre eigenen)
    const tageDa = tage.map(t => ({ ...t, nrs: t.nrs.filter(n => drin.has(n)) })).filter(t => t.nrs.length);
    Object.assign(koffer, { nrs: neu, gepackt: koffer.gepackt.filter(n => drin.has(n)), tage: tageDa.length ? tageDa : null, luecken: [], tipps: [],
      extras: extrasJetzt(), quelle: "chat", gepacktFuer: eingabenSchluessel(e) });
    aendern = false; chatOffen = false; speichern(koffer);
    toast(`${neu.length} Teile aus der Antwort eingepackt`);
    Promise.resolve(neuZeichnen()).then(() => document.getElementById("rahmen")?.scrollTo(0, 0)); // oben steht jetzt die Packliste
  } };
  const chat = chatgptPanel(items, stil, frage, t => miniKachel(t, bild, oeffnen));
  let chatTeil = chat;
  if (gepackt) {
    chatTeil = el("details", { class: "klappe" }, el("summary", {}, el("span", {}, "💬 Mit ChatGPT oder Gemini packen")), chat);
    chatTeil.open = chatOffen; chatTeil.ontoggle = () => { chatOffen = chatTeil.open; };
  }

  // Ganz unten: Kopie für eine neue Reise (z. B. nächstes Jahr wieder Kreta) und Löschen
  const kopieren = el("button", { type: "button", class: "btn" }, "📋 Als neue Reise kopieren");
  kopieren.onclick = () => {
    const neu = neueReise();
    if (!neu) return;
    const kopie = JSON.parse(JSON.stringify({ eingaben: e, nrs: koffer.nrs, tage: koffer.tage, luecken: koffer.luecken, tipps: koffer.tipps, quelle: koffer.quelle, gepacktFuer: koffer.gepacktFuer }));
    Object.assign(neu, kopie, { name: koffer.name ? `${koffer.name} (Kopie)`.slice(0, MAX_NAME) : null, gepackt: [],
      extras: koffer.extras ? koffer.extras.map(x => ({ text: x.text, gepackt: false, menge: x.menge ?? null, selbst: !!x.selbst, eigen: !!x.eigen })) : null });
    speichern(neu); toast("Kopie angelegt, alle Haken sind wieder offen. Den Namen änderst du unter „Deine Reise“.");
    reiseOffen = true; nav.ersetze({ v: "koffer", id: neu.id });
  };
  const loeschen = el("button", { type: "button", class: "btn" }, "🗑 Reise löschen");
  loeschen.onclick = () => {
    if (!leerReise(koffer) && !confirm(`${koffer.name ? `„${koffer.name}“` : "Diese Reise"} löschen?\n\nPackliste, Haken und die Chat-Antwort dazu sind dann weg. Deine Kleidung bleibt, wie sie ist.`)) return;
    reisen = reisen.filter(r => r !== koffer); chatMerkLeeren({ koffer: { id: koffer.id } }); speichern();
    toast("Reise gelöscht"); nav.back();
  };
  const unten = leerReise(koffer) ? null : el("div", { class: "actions wrap" }, gepackt ? kopieren : null, loeschen);
  const kopfEl = kopf(koffer.name || "Neue Reise", gepackt ? fuer || null : "Tipp an, wie lange und wofür, dann packt die App oder der Chat.");

  if (!gepackt) { fill(box, kopfEl, reise, chatTeil, unten); return; }

  // --- Packliste ---
  const drin = koffer.nrs.map(n => nachNr.get(n)), fehlt = koffer.nrs.filter((n, i) => !drin[i] || drin[i].geloescht || drin[i].verkauf === "verkauft");
  const teile = drin.filter(t => t && !t.geloescht && t.verkauf !== "verkauft");
  const hak = new Set(koffer.gepackt), extras = koffer.extras || [];
  const zahl = teile.filter(t => hak.has(t.nr)).length + extras.filter(x => x.gepackt).length, gesamt = teile.length + extras.length;
  const kachel = (t, an, zeichen, onclick, titel) => {
    // Seit 0.37: das gerade abgehakte Teil ploppt nach dem Neuzeichnen kurz auf (app.css .pop)
    const pop = popNr === t.nr; if (pop) popNr = null;
    const b = el("button", { type: "button", class: "teil mini" + (an ? " markiert" : "") + (pop ? " pop" : ""), title: titel },
      el("span", { class: "bild" }, el("img", { src: bild(t.vorschau), alt: beschreibung(t), loading: "lazy" }), el("span", { class: "plakette" }, nrText(t.nr)),
        el("span", { class: "haken" }, zeichen)),
      el("span", { class: "text" }, `Nr. ${nrText(t.nr)} – ${beschreibung(t)}`));
    b.setAttribute("aria-pressed", an ? "true" : "false");
    b.onclick = onclick;
    return b;
  };
  const umschalten = t => { hak.has(t.nr) ? hak.delete(t.nr) : hak.add(t.nr); koffer.gepackt = [...hak]; speichern(koffer, false); popNr = t.nr; neuZeichnen(); };
  const raus = t => { koffer.nrs = koffer.nrs.filter(n => n !== t.nr); koffer.gepackt = koffer.gepackt.filter(n => n !== t.nr); koffer.tage = null; speichern(koffer); toast(`Nr. ${nrText(t.nr)} aus dem Koffer genommen`); neuZeichnen(); };
  const dazu = t => { if (koffer.nrs.length >= MAX_TEILE) return toast(`Höchstens ${MAX_TEILE} Teile.`); koffer.nrs = [...koffer.nrs, t.nr]; koffer.tage = null; speichern(koffer); toast(`Nr. ${nrText(t.nr)} eingepackt`); neuZeichnen(); };
  const plaetze = [...new Set([...REIHE, ...teile.map(platzVon)])];
  const zeigen = aendern ? plaetze.filter(p => teile.some(t => platzVon(t) === p) || pool.some(t => platzVon(t) === p && ["oben", "unten", "ganz", "lage", "schuh", "tasche", "bade"].includes(p)))
    : plaetze.filter(p => teile.some(t => platzVon(t) === p));
  const gruppen = zeigen.map(p => {
    const hier = teile.filter(t => platzVon(t) === p);
    const vorschlaege = aendern ? kofferVorschlaege(p, teile, pool, e, mitStil) : [];
    return el("div", { class: "koffer-gruppe" },
      el("div", { class: "koffer-gruppe-kopf" }, KOFFER_PLATZ_NAME[p] || "Sonstiges", el("span", { class: "klappe-zahl" }, String(hier.length))),
      hier.length ? el("div", { class: "kombi-teile" }, ...hier.map(t => aendern ? kachel(t, false, "✕", () => raus(t), "Aus dem Koffer nehmen") : kachel(t, hak.has(t.nr), hak.has(t.nr) ? "✓" : "", () => umschalten(t), "Abhaken"))) : null,
      vorschlaege.length ? el("div", { class: "note" }, "Dazu nehmen:") : null,
      vorschlaege.length ? el("div", { class: "kombi-teile" }, ...vorschlaege.map(t => kachel(t, false, "＋", () => dazu(t), "Einpacken"))) : null);
  });
  const aendernKnopf = el("button", { type: "button", class: "btn" }, aendern ? "Fertig mit Ändern" : "✏️ Teile ändern");
  aendernKnopf.onclick = () => { aendern = !aendern; neuZeichnen(); };
  const reiseGeaendert = koffer.gepacktFuer && koffer.gepacktFuer !== eingabenSchluessel(e);
  const fuellung = el("div", {}); fuellung.style.width = `${gesamt ? Math.round(100 * zahl / gesamt) : 0}%`;
  const balken = el("div", { class: "bar" }, fuellung);
  const liste = el("div", { class: "panel" },
    el("div", { class: "koffer-stand" }, el("strong", {}, "Packliste"), el("span", {}, `${zahl} von ${gesamt} eingepackt`)), balken,
    el("p", { class: "hint" }, aendern ? "Tippe ein Teil an, um es herauszunehmen, oder ein Teil bei „Dazu nehmen“, um es einzupacken."
      : `Tippe ein Teil an, wenn es im Koffer ist.${koffer.quelle === "chat" ? " Diese Liste stammt aus deiner Chat-Antwort." : ""}`),
    // Mit Knopf gleich hier (seit 0.31, Durchsicht 19.11.2026): Vorher hieß es „oben … dort“, aber „Deine Reise“ steht unten und ist eingeklappt
    reiseGeaendert ? el("div", {}, el("p", { class: "hint" }, koffer.quelle === "chat"
        ? "Du hast die Angaben zur Reise geändert, die Packliste ist noch die alte aus dem Chat. Lass die App neu packen oder frag unten den Chat noch einmal."
        : "Du hast die Angaben zur Reise geändert, die Packliste ist noch die alte."),
      el("div", { class: "actions" }, el("button", { type: "button", class: "btn", onclick: () => packKnopf.click() }, "🧳 Von der App neu packen lassen"))) : null,
    fehlt.length ? el("p", { class: "hint" }, `${fehlt.map(n => "Nr. " + nrText(n)).join(", ")} ${fehlt.length === 1 ? "ist" : "sind"} nicht mehr im Kleiderschrank.`) : null,
    // Seit 0.34: Verliehenes bleibt auf der Liste (kommt ja zurück), aber mit Hinweis
    teile.some(t => t.verliehen) ? el("p", { class: "hint" }, `🤝 ${teile.filter(t => t.verliehen).map(t => `Nr. ${nrText(t.nr)} (an ${t.verliehen.an})`).join(", ")} ${teile.filter(t => t.verliehen).length === 1 ? "ist" : "sind"} gerade verliehen.`) : null,
    ...koffer.luecken.map(x => el("p", { class: "hint" }, "⚠️ " + x)),
    ...gruppen,
    el("div", { class: "actions" }, aendernKnopf));

  // --- Outfit pro Tag (aus der Chat-Antwort, sonst von der App aus genau diesen Teilen) ---
  // Tage aus dem Chat: Teile, die nicht mehr im Koffer sind (z. B. inzwischen im Papierkorb), fallen nur aus ihrem Tag heraus (seit 0.31;
  // vorher ersetzte die App dann alle Chat-Tage still durch ihre eigenen)
  const imKoffer = new Set(teile.map(t => t.nr));
  const ausChat = (koffer.tage || []).map(d => ({ titel: d.titel, nrs: d.nrs.filter(n => imKoffer.has(n)) })).filter(d => d.nrs.length);
  const plan = ausChat.length ? ausChat : tageVon(teile, e, mitStil).map(d => ({ titel: `Tag ${d.tag} · ${d.anlass}`, nrs: d.nrs }));
  const tage = plan.length ? el("details", { class: "klappe" }, el("summary", {}, el("span", {}, "👗 Outfit pro Tag"), el("span", { class: "klappe-zahl" }, String(plan.length))),
    ...plan.map(d => {
      const ts = d.nrs.map(n => teile.find(t => t.nr === n)).filter(Boolean);
      return el("div", { class: "panel kombi" }, el("div", { class: "kombi-titel" }, d.titel),
        el("div", { class: "kombi-nummern" }, ts.map(t => `Nr. ${nrText(t.nr)}`).join(" + ")),
        el("div", { class: "kombi-teile" }, ...ts.map(t => miniKachel(t, bild, oeffnen))));
    })) : null;
  if (tage) { tage.open = tageOffen; tage.ontoggle = () => { tageOffen = tage.open; }; }

  // --- Außerdem einpacken (nicht im Kleiderschrank) ---
  const extraListe = el("div", { class: "extra-liste" }, ...extras.map((x, i) => {
    const box2 = el("input", { type: "checkbox", checked: x.gepackt, "aria-label": x.text });
    box2.onchange = () => { x.gepackt = box2.checked; speichern(koffer, false); neuZeichnen(); };
    const weg = el("button", { type: "button", class: "link", "aria-label": `„${x.text}“ entfernen` }, "✕");
    weg.onclick = () => { koffer.extras = extras.filter((_, j) => j !== i); speichern(koffer); neuZeichnen(); };
    // Anzahl (seit 0.30): − / ＋, bei 1 nimmt „−“ die Zahl ganz weg. Ohne Zahl ein kleines „＋ Anzahl“.
    // selbst: Diese Anzahl hat sie eingestellt, die App ändert sie nicht mehr, wenn sich die Reise ändert
    const setze = n => { x.menge = n; x.selbst = true; speichern(koffer); neuZeichnen(); };
    const knopf = (zeichen, label, f) => { const b = el("button", { type: "button", class: "menge-knopf", "aria-label": `${label}: ${x.text}` }, zeichen); b.onclick = f; return b; };
    const menge = x.menge
      ? el("span", { class: "menge" }, knopf("−", x.menge === 1 ? "Anzahl entfernen" : "Weniger", () => setze(x.menge > 1 ? x.menge - 1 : null)),
          el("span", { class: "menge-zahl", "aria-label": `Anzahl ${x.menge}` }, `${x.menge}×`), knopf("＋", "Mehr", () => setze(Math.min(MAX_MENGE, x.menge + 1))))
      : knopf("＋ Anzahl", "Anzahl angeben", () => setze(1));
    if (!x.menge) menge.classList.add("ohne");
    // ⓘ bei Unterwäsche und Socken: wie die App die Anzahl rechnet (Wunsch 19.11.2026, „Unter einem Info Button“; iPhone-Test:
    // bei 14 Tagen mit Waschen blieb es bei 5× und man sah nicht, warum)
    const hilfe = kofferMenge(x.text, e) !== null ? info(
      `Vorschlag der App: eine pro Tag und eine Reserve${e.waschen ? ". Mit „Ich kann waschen“ rechnet sie höchstens 4 Tage plus 1 Reserve, egal wie lange die Reise ist" : ""}.`,
      "Mit − und ＋ stellst du die Zahl selbst ein. Dann ändert die App sie nicht mehr, auch wenn du die Reise änderst.") : null;
    const zeile = el("div", { class: "extra-zeile" + (x.gepackt ? " erledigt" : "") }, el("label", {}, box2, el("span", {}, x.text)), hilfe?.knopf, menge, weg);
    return hilfe ? el("div", {}, zeile, hilfe.box) : zeile;
  }));
  const neuText = el("input", { type: "text", class: "feld-eingabe", maxLength: MAX_EXTRA_TEXT, placeholder: "z. B. Reiseadapter", autocomplete: "off", enterKeyHint: "done", "aria-label": "Eigener Eintrag" });
  const neuKnopf = el("button", { type: "button", class: "btn" }, "Hinzufügen");
  neuKnopf.onclick = () => {
    const text = clean(neuText.value).slice(0, MAX_EXTRA_TEXT);
    if (!text) return toast("Bitte etwas eintippen.");
    if (extras.length >= MAX_EXTRAS) return toast(`Höchstens ${MAX_EXTRAS} Einträge.`);
    koffer.extras = [...extras, { text, gepackt: false, menge: null, selbst: false, eigen: true }]; speichern(koffer); neuZeichnen();
  };
  neuText.onkeydown = ev => { if (ev.key === "Enter") neuKnopf.click(); };
  const sonstiges = el("div", { class: "panel" }, el("strong", {}, "Außerdem einpacken"),
    el("p", { class: "hint" }, "Was nicht im Kleiderschrank ist. Eigene Einträge kannst du dazuschreiben."),
    extraListe, el("div", { class: "extra-neu" }, neuText, neuKnopf));

  const tipps = koffer.tipps.length ? el("div", { class: "panel" }, el("strong", {}, "Tipps"), el("ul", { class: "tipps" }, ...koffer.tipps.map(x => el("li", {}, x)))) : null;
  fill(box, kopfEl, liste, tage, sonstiges, tipps, reise, chatTeil, unten);
}

/* ---------- „Deine Reisen“ ---------- */
function renderUebersicht(box, kopf, items, bild, nav) {
  reisen = reisen.filter(r => !leerReise(r)); // „＋ Neue Reise“ angetippt und ohne Angabe zurück: weg damit
  if (!reisen.length) { const r = neueReise(); return nav.ersetze({ v: "koffer", id: r.id }); } // noch keine Reise: gleich eine neue
  const nachNr = new Map(items.map(t => [t.nr, t]));
  const neu = el("button", { type: "button", class: "btn primary" }, "＋ Neue Reise");
  neu.onclick = () => { const r = neueReise(); if (r) nav.go({ v: "koffer", id: r.id }); };
  const karte = r => {
    const teile = (r.nrs || []).map(n => nachNr.get(n)).filter(t => t && !t.geloescht && t.verkauf !== "verkauft");
    const hak = new Set(r.gepackt), extras = r.extras || [];
    const zahl = teile.filter(t => hak.has(t.nr)).length + extras.filter(x => x.gepackt).length, gesamt = teile.length + extras.length;
    const stand = r.nrs === null ? "noch nicht gepackt" : zahl === gesamt && gesamt ? "✓ alles eingepackt" : `${zahl} von ${gesamt} eingepackt`;
    return el("button", { type: "button", class: "outfit-karte", onclick: () => nav.go({ v: "koffer", id: r.id }) },
      el("span", { class: "look" }, teile[0] ? el("img", { src: bild(teile[0].vorschau), alt: "" }) : el("span", { class: "koffer-zeichen" }, "✈︎")),
      el("span", { class: "outfit-info" },
        el("span", { class: "name" }, r.name || "Reise ohne Namen"),
        el("span", { class: "anzahl" }, [fuerText(r.eingaben), stand].filter(Boolean).join(" · ")),
        el("span", { class: "outfit-mini" }, ...teile.slice(1, 7).map(t => el("img", { src: bild(t.vorschau), alt: `Nr. ${nrText(t.nr)}`, loading: "lazy" })))));
  };
  fill(box, kopf("🧳 Koffer packen", "Deine Reisen. Tippe eine an, um weiterzupacken."), el("div", { class: "actions" }, neu),
    ...[...reisen].sort((a, b) => b.geaendert.localeCompare(a.geaendert)).map(karte));
}
