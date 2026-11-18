// „🧳 Koffer packen“ (seit 0.28, Wunsch 18.11.2026): Reise antippen → die App packt eine kleine Auswahl, die sich gut kombinieren
// lässt (regeln.js kofferPacken), oder der Chat (Anfrage mit eigenem Text, Antwort als Packliste übernehmen). Dann eine Liste zum
// Abhaken, auch über mehrere Tage, dazu ein Outfit-Vorschlag pro Tag und Dinge, die nicht im Kleiderschrank sind (Ladekabel …).
// Ein Koffer zur Zeit, gespeichert in meta „koffer“: nur auf dem Gerät und nicht in der Sicherung (ein Koffer ist etwas Vorübergehendes).
// Texte nur per textContent/DOM, nie per innerHTML (eigene Einträge sind eingetippter Text).
import { el, fill, toast, fehlerToast, field, choice, clean, mitInfo, beschreibung } from "./ui.js?v=19";
import { getMeta, setMeta, nrText } from "./speicher.js?v=11";
import { kandidaten, kofferPacken, kofferTage, kofferVorschlaege, kofferExtras, platzVon, KOFFER_ANLAESSE, KOFFER_TAGE, KOFFER_PLATZ_NAME, TEMPERATUREN, WETTER } from "./regeln.js?v=18";
import { chatgptPanel, chatMerkLeeren, chatHatAntwort } from "./chatgpt.js?v=19";
import { miniKachel } from "./passt.js?v=25";
import { stilAktuell } from "./stil.js?v=20";

const WASCHEN = "Ich kann waschen", HAND = "Nur Handgepäck";
const REIHE = ["oben", "unten", "ganz", "lage", "schuh", "tasche", "zubehoer", "bade", "schmuck", "guertel"];
const MAX_EXTRAS = 40, MAX_EXTRA_TEXT = 60, MAX_TEILE = 80;
const leer = () => ({ eingaben: { tage: null, temperatur: null, wetter: [], anlaesse: [], waschen: false, handgepaeck: false },
  nrs: null, gepackt: [], tage: null, luecken: [], tipps: [], extras: null, quelle: null, gepacktFuer: null });
let koffer = null;           // aus meta „koffer“, beim ersten Öffnen geladen
let aendern = false;         // „✏️ Teile ändern“ ist an (pro Sitzung)
let reiseOffen = false, tageOffen = false, chatOffen = false;

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
  if (Array.isArray(o.tage)) k.tage = o.tage.slice(0, 30).map(t => ({ titel: typeof t?.titel === "string" ? clean(t.titel).slice(0, 30) : null, nrs: zahlen(t?.nrs, 12) })).filter(t => t.titel && t.nrs.length);
  k.luecken = Array.isArray(o.luecken) ? o.luecken.filter(x => typeof x === "string").slice(0, 10).map(x => x.slice(0, 200)) : [];
  k.tipps = Array.isArray(o.tipps) ? o.tipps.filter(x => typeof x === "string").slice(0, 6).map(x => x.slice(0, 200)) : [];
  if (Array.isArray(o.extras)) k.extras = o.extras.filter(x => typeof x?.text === "string" && clean(x.text)).slice(0, MAX_EXTRAS)
    .map(x => ({ text: clean(x.text).slice(0, MAX_EXTRA_TEXT), gepackt: x.gepackt === true }));
  k.quelle = o.quelle === "chat" ? "chat" : o.quelle === "app" ? "app" : null;
  k.gepacktFuer = typeof o.gepacktFuer === "string" ? o.gepacktFuer.slice(0, 1000) : null;
  return k;
}
async function laden() {
  if (!koffer) { try { koffer = pruefen(await getMeta("koffer")); } catch (e) { console.error(e); koffer = leer(); } }
  return koffer;
}
const speichern = () => setMeta("koffer", koffer).catch(e => fehlerToast("Speichern hat nicht geklappt", e));
const eingabenSchluessel = e => JSON.stringify([e.tage, e.temperatur, e.wetter, e.anlaesse, e.waschen, e.handgepaeck]);

// Für „↺ Neu packen“ oben rechts (schrank.js)
export const kofferHatEtwas = () => !!koffer && (koffer.nrs !== null || !!koffer.eingaben.tage || !!koffer.eingaben.temperatur
  || koffer.eingaben.wetter.length > 0 || koffer.eingaben.anlaesse.length > 0 || chatHatAntwort({ koffer: true }));
export const kofferMitListe = () => !!koffer && (koffer.nrs !== null || chatHatAntwort({ koffer: true }));
export function kofferNeu() { koffer = leer(); aendern = false; reiseOffen = false; chatMerkLeeren({ koffer: true }); speichern(); }

/* ---------- Ansicht ---------- */
// bild(blob) = Bild-Adresse (schrank.js gibt sie beim nächsten Zeichnen frei), oeffnen(nr) = Teil ansehen
export async function renderKoffer(box, kopf, items, stil, bild, oeffnen, neuZeichnen) {
  await laden();
  const e = koffer.eingaben, pool = kandidaten(items), nachNr = new Map(items.map(t => [t.nr, t]));
  const mitStil = { mode: stilAktuell(stil).mode };
  const gepackt = koffer.nrs !== null;
  const aenderung = felder => { Object.assign(e, felder); speichern(); neuZeichnen(); };

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
      extras: koffer.extras || kofferExtras(e).map(text => ({ text, gepackt: false })), quelle: "app", gepacktFuer: eingabenSchluessel(e) });
    reiseOffen = false; aendern = false; speichern();
    toast(`${r.nrs.length} Teile eingepackt – jetzt abhaken, was im Koffer ist`);
    neuZeichnen();
  };
  const reiseInhalt = [
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
  const fuer = [e.tage && `${e.tage} ${e.tage === 1 ? "Tag" : "Tage"}`, e.temperatur, ...e.wetter, ...e.anlaesse].filter(Boolean).join(" · ");
  let reise;
  if (gepackt) {
    reise = el("details", { class: "klappe" }, el("summary", {}, el("span", {}, "Deine Reise"), el("span", { class: "klappe-zahl" }, fuer || "ändern")), el("div", { class: "panel" }, ...reiseInhalt));
    reise.open = reiseOffen; reise.ontoggle = () => { reiseOffen = reise.open; };
  } else reise = el("div", { class: "panel" }, el("strong", {}, "Deine Reise"), ...reiseInhalt);

  // --- Mit ChatGPT oder Gemini ---
  const frage = { koffer: { ...e }, uebernehmen: (nrs, tage) => {
    const neu = nrs.filter(n => nachNr.has(n)).slice(0, MAX_TEILE);
    Object.assign(koffer, { nrs: neu, gepackt: koffer.gepackt.filter(n => neu.includes(n)), tage: tage.length ? tage : null, luecken: [], tipps: [],
      extras: koffer.extras || kofferExtras(e).map(text => ({ text, gepackt: false })), quelle: "chat", gepacktFuer: eingabenSchluessel(e) });
    aendern = false; chatOffen = false; speichern();
    toast(`${neu.length} Teile aus der Antwort eingepackt`);
    Promise.resolve(neuZeichnen()).then(() => document.getElementById("rahmen")?.scrollTo(0, 0)); // oben steht jetzt die Packliste
  } };
  const chat = chatgptPanel(items, stil, frage, t => miniKachel(t, bild, oeffnen));
  let chatTeil = chat;
  if (gepackt) {
    chatTeil = el("details", { class: "klappe" }, el("summary", {}, el("span", {}, "💬 Mit ChatGPT oder Gemini packen")), chat);
    chatTeil.open = chatOffen; chatTeil.ontoggle = () => { chatOffen = chatTeil.open; };
  }

  if (!gepackt) { fill(box, kopf, reise, chatTeil); return; }

  // --- Packliste ---
  const drin = koffer.nrs.map(n => nachNr.get(n)), fehlt = koffer.nrs.filter((n, i) => !drin[i] || drin[i].geloescht || drin[i].verkauf === "verkauft");
  const teile = drin.filter(t => t && !t.geloescht && t.verkauf !== "verkauft");
  const hak = new Set(koffer.gepackt), extras = koffer.extras || [];
  const zahl = teile.filter(t => hak.has(t.nr)).length + extras.filter(x => x.gepackt).length, gesamt = teile.length + extras.length;
  const kachel = (t, an, zeichen, onclick, titel) => {
    const b = el("button", { type: "button", class: "teil mini" + (an ? " markiert" : ""), title: titel },
      el("span", { class: "bild" }, el("img", { src: bild(t.vorschau), alt: beschreibung(t), loading: "lazy" }), el("span", { class: "plakette" }, nrText(t.nr)),
        el("span", { class: "haken" }, zeichen)),
      el("span", { class: "text" }, `Nr. ${nrText(t.nr)} – ${beschreibung(t)}`));
    b.setAttribute("aria-pressed", an ? "true" : "false");
    b.onclick = onclick;
    return b;
  };
  const umschalten = t => { hak.has(t.nr) ? hak.delete(t.nr) : hak.add(t.nr); koffer.gepackt = [...hak]; speichern(); neuZeichnen(); };
  const raus = t => { koffer.nrs = koffer.nrs.filter(n => n !== t.nr); koffer.gepackt = koffer.gepackt.filter(n => n !== t.nr); koffer.tage = null; speichern(); toast(`Nr. ${nrText(t.nr)} aus dem Koffer genommen`); neuZeichnen(); };
  const dazu = t => { if (koffer.nrs.length >= MAX_TEILE) return toast(`Höchstens ${MAX_TEILE} Teile.`); koffer.nrs = [...koffer.nrs, t.nr]; koffer.tage = null; speichern(); toast(`Nr. ${nrText(t.nr)} eingepackt`); neuZeichnen(); };
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
    reiseGeaendert ? el("p", { class: "hint" }, "Du hast die Reise oben geändert. Tippe dort auf „Neu von der App packen lassen“, wenn die Liste dazu passen soll.") : null,
    fehlt.length ? el("p", { class: "hint" }, `${fehlt.map(n => "Nr. " + nrText(n)).join(", ")} ${fehlt.length === 1 ? "ist" : "sind"} nicht mehr im Kleiderschrank.`) : null,
    ...koffer.luecken.map(x => el("p", { class: "hint" }, "⚠️ " + x)),
    ...gruppen,
    el("div", { class: "actions" }, aendernKnopf));

  // --- Outfit pro Tag (aus der Chat-Antwort, sonst von der App aus genau diesen Teilen) ---
  const ausChat = koffer.tage?.every(d => d.nrs.every(n => teile.some(t => t.nr === n))) ? koffer.tage : null;
  const plan = ausChat ? ausChat.map(d => ({ titel: d.titel, nrs: d.nrs })) : kofferTage(teile, e, mitStil).map(d => ({ titel: `Tag ${d.tag} · ${d.anlass}`, nrs: d.nrs }));
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
    box2.onchange = () => { x.gepackt = box2.checked; speichern(); neuZeichnen(); };
    const weg = el("button", { type: "button", class: "link", "aria-label": `„${x.text}“ entfernen` }, "✕");
    weg.onclick = () => { koffer.extras = extras.filter((_, j) => j !== i); speichern(); neuZeichnen(); };
    return el("div", { class: "extra-zeile" + (x.gepackt ? " erledigt" : "") }, el("label", {}, box2, el("span", {}, x.text)), weg);
  }));
  const neuText = el("input", { type: "text", class: "feld-eingabe", maxLength: MAX_EXTRA_TEXT, placeholder: "z. B. Reiseadapter", autocomplete: "off", enterKeyHint: "done", "aria-label": "Eigener Eintrag" });
  const neuKnopf = el("button", { type: "button", class: "btn" }, "Hinzufügen");
  neuKnopf.onclick = () => {
    const text = clean(neuText.value).slice(0, MAX_EXTRA_TEXT);
    if (!text) return toast("Bitte etwas eintippen.");
    if (extras.length >= MAX_EXTRAS) return toast(`Höchstens ${MAX_EXTRAS} Einträge.`);
    koffer.extras = [...extras, { text, gepackt: false }]; speichern(); neuZeichnen();
  };
  neuText.onkeydown = ev => { if (ev.key === "Enter") neuKnopf.click(); };
  const sonstiges = el("div", { class: "panel" }, el("strong", {}, "Außerdem einpacken"),
    el("p", { class: "hint" }, "Was nicht im Kleiderschrank ist. Eigene Einträge kannst du dazuschreiben."),
    extraListe, el("div", { class: "extra-neu" }, neuText, neuKnopf));

  const tipps = koffer.tipps.length ? el("div", { class: "panel" }, el("strong", {}, "Tipps"), el("ul", { class: "tipps" }, ...koffer.tipps.map(x => el("li", {}, x)))) : null;
  fill(box, kopf, liste, tage, sonstiges, tipps, reise, chatTeil);
}
