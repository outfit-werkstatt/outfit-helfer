// Etappe 1b: Kleiderschrank ansehen und ordnen.
// Startseite mit Ordnern („Mein Kleiderschrank“ = immer alle Teile, dazu eigene Ordner wie Alben in der Fotos-App,
// ein Teil kann in mehreren sein), Ordner-Ansicht mit Filtern, Teil-Ansicht (ändern, Ordner, Papierkorb), Papierkorb.
// Jede Ansicht bekommt einen Eintrag im Verlauf, damit „Zurück“ (Knopf, Wischen, Android-Taste) funktioniert.
import { $, el, fill, toast, fehlerToast, fehlerText, swatch, clean, beschreibung, choice, field, angabenFelder, angabenVon, customReady, zeigeGross, teilAngleichen, merkeMarken, datumText } from "./ui.js?v=19";
import { allItems, getItem, getPhoto, updateItem, updateItems, updateAll, trashItem, restoreItem, purgeItems, getFolders, setFolders, deleteFolder, setFolderItems, getStil, getMeta, setMeta, getOutfits, nummernZuruecksetzen, nrText } from "./speicher.js?v=11";
import { renderStil, stilKurz } from "./stil.js?v=20";
import { renderZip, zipHinweis, zipKurz } from "./zip-ansicht.js?v=27";
import { renderPasst, miniKachel, passtStand, passtLaden, passtNeu, passtHatEtwas } from "./passt.js?v=24";
import { renderOutfit, outfitStand, outfitLaden, outfitNeu, outfitHatEtwas } from "./outfit.js?v=21";
import { renderFertigListe, renderFertig, fertigKachel, outfitSpeichern, MAX_TEILE, MAX_NAME } from "./fertig.js?v=9";
import { bildPaketBereich, chatMerkStand, chatMerkLaden, chatHatAntwort } from "./chatgpt.js?v=18";
import { renderVinted } from "./vinted.js?v=9";
import { GROUPS } from "./ki.js?v=8";
import { imSchrank, imVerkauf, istVerkauft, verkaufFeld, verkaufKurz, verkaufZeichen, langeOnline, preisText, KEIN_VERKAUF,
  ZUM_VERKAUF, EINGESTELLT, VERKAUFT, VERKAUF_NAME, VERKAUFT_NAME, LANGE_TAGE } from "./verkauf.js?v=2";

// Feste Ordner: „Mein Kleiderschrank“ (alle) und „Ziehe ich nicht an“ (füllt sich von selbst, erscheint nur, wenn es solche Teile gibt).
// Seit 0.26 ebenso „💰 Zum Verkaufen“ (will ich verkaufen + bei Vinted eingestellt) und „✅ Verkauft“ (nicht mehr im Kleiderschrank).
const ALLE = "alle", HAUPT = "Mein Kleiderschrank", NICHT = "nicht", NICHT_NAME = "🚫 Ziehe ich nicht an", TAG = 24 * 3600 * 1000, KORB_TAGE = 30;
const L_VERKAUF = "verkaufen", L_VERKAUFT = "verkauft";
// Auf der Startseite stehen 🚫, 💰 und ✅ zusammen in EINER Kachel „♻️ Aussortiert“ (iPhone-Test 18.11.2026: sonst zu viele Ordner).
// Drinnen schalten drei Knöpfe zwischen den Bereichen um; der zuletzt gewählte gilt beim nächsten Öffnen (pro Sitzung).
const AUSSORTIERT = [NICHT, L_VERKAUF, L_VERKAUFT], AUSSORTIERT_NAME = "♻️ Aussortiert";
const BEREICH_NAME = { [NICHT]: ["🚫", "Nicht anziehen"], [L_VERKAUF]: ["💰", "Zum Verkaufen"], [L_VERKAUFT]: ["✅", "Verkauft"] };
let aussortiertZuletzt = null;
const FESTE_NAMEN = [HAUPT, "Papierkorb", "Ziehe ich nicht an", NICHT_NAME, "Ohne Ordner", "Fertige Outfits", "⭐ Fertige Outfits",
  "Zum Verkaufen", VERKAUF_NAME, "Verkauft", VERKAUFT_NAME, "Aussortiert", AUSSORTIERT_NAME];
// „🚫 Ziehe ich nicht an“: ohne Teile, die schon beim Verkaufen sind (die stehen unter „💰 Zum Verkaufen“, sonst doppelt)
const nichtAn = da => da.filter(t => t.nichtAnziehen && !t.verkauf);
const GROUP_ORDER = GROUPS.map(([g]) => g);
// Im Kleiderschrank: nicht im Papierkorb und (seit 0.26) nicht verkauft
const sichtbar = items => items.filter(imSchrank);
const verkaufteVon = items => items.filter(t => !t.geloescht && istVerkauft(t))
  .sort((a, b) => (b.verkauftAm || "").localeCompare(a.verkauftAm || "") || b.nr - a.nr);
const restTage = t => Math.max(0, KORB_TAGE - Math.floor((Date.now() - Date.parse(t.geloescht)) / TAG));
// „noch 3 Tage“, „noch 1 Tag“, „noch heute“
const nochTage = t => { const n = restTage(t); return n <= 0 ? "noch heute" : n === 1 ? "noch 1 Tag" : `noch ${n} Tage`; };
// Ordner angelegt, umbenannt oder gelöscht → offene Prüfen-Karten (app.js) zeigen die neue Liste
const ordnerMelden = () => document.dispatchEvent(new Event("ordner-geaendert"));

/* ---------- Ansichten und „Zurück“ ---------- */
let current = { v: "start", d: 0 }, urls = [];
let bearbeitet = false; // „Angaben ändern“ ist offen: dann nicht von außen neu zeichnen, sonst wären die Änderungen weg
let geaendert = () => false; // bei „Angaben ändern“: wurde schon etwas angetippt oder eingetippt?
let mehrfach = null;    // „Auswählen“ (Ordner-Ansicht, Papierkorb): Set der angetippten Nummern, sonst null
const url = blob => { const u = URL.createObjectURL(blob); urls.push(u); return u; };
// Gescrollt wird im eigenen Bereich #rahmen, nicht in der ganzen Seite (wegen Uhrzeit und Akku auf dem iPhone, siehe app.css)
const scrollStelle = () => $("rahmen").scrollTop, scrollen = y => $("rahmen").scrollTo(0, y);
// Dieselbe Ansicht? (seit 0.25: Zweimal schnell auf eine Kachel legte zwei Einträge an, „Zurück“ musste man dann zweimal tippen)
const gleicheAnsicht = (a, b) => ["v", "nr", "id", "zusammenstellen"].every(k => (a[k] ?? null) === (b[k] ?? null));
// Ungespeicherte Änderungen bei „Angaben ändern“ nicht still verwerfen (seit 0.25)
const darfVerlassen = () => !bearbeitet || !geaendert() || confirm("Änderungen verwerfen?\n\nDu hast die Angaben geändert, aber noch nicht gespeichert.");
export function go(state) {
  if (gleicheAnsicht(state, current) || !darfVerlassen()) return;
  history.replaceState({ ...current, y: scrollStelle() }, "");
  current = { ...state, d: current.d + 1 };
  history.pushState(current, "");
  show(0);
}
function back() {
  if (current.d > 0) history.back();
  else { current = { v: "start", d: 0 }; history.replaceState(current, ""); show(0); }
}
// Knopf „‹ Zurück“: Ein zweites Tippen kurz danach zählt nicht (sonst ging es zwei Schritte zurück)
let zurueckZeit = 0;
const zurueckTippen = () => { const jetzt = Date.now(); if (jetzt - zurueckZeit < 700) return; zurueckZeit = jetzt; back(); };
// Die aktuelle Ansicht ersetzen, ohne neuen Eintrag im Verlauf (nach „Eigenes Outfit“ → das gespeicherte Outfit;
// „Zurück“ führt dann zur Liste der fertigen Outfits und nicht wieder zum Antippen)
function ersetze(state) { current = { ...state, d: current.d }; history.replaceState(current, ""); show(0); }
addEventListener("popstate", e => {
  // Will sie bei „Angaben ändern“ doch bleiben, kommt die Ansicht wieder in den Verlauf (der Schritt zurück ist schon passiert)
  if (!darfVerlassen()) { history.pushState(current, ""); return; }
  current = e.state || { v: "start", d: 0 }; show(current.y || 0);
});
history.scrollRestoration = "manual"; // die Stelle merken wir uns selbst (y im Verlauf)
async function show(y) {
  auswahl = null; bearbeitet = false; geaendert = () => false; // Auswählen und „Angaben ändern“ enden, sobald man die Ansicht wechselt
  mehrfach = current.zusammenstellen ? new Set() : null; // „＋ Eigenes Outfit zusammenstellen“ beginnt gleich mit dem Antippen
  $("ansichtStart").hidden = current.v !== "start"; $("ansicht").hidden = current.v === "start";
  try { await render(); } catch (e) { fehlerToast("Anzeigen hat nicht geklappt", e); console.error(e); }
  scrollen(y); schwebeNeu();
}
// Dieselbe Ansicht neu zeichnen, ohne zu springen. Seit 0.26 bleibt die Höhe stehen, bis das große Foto wieder geladen ist:
// Vorher war die Teil-Ansicht kurz ohne Foto zu kurz für die alte Stelle und sprang nach dem Antippen (z. B. „✅ Verkauft“) nach oben.
async function neuZeichnen() {
  const y = scrollStelle(), box = $("ansicht");
  box.style.minHeight = box.offsetHeight ? box.offsetHeight + "px" : "";
  try { await render(); } finally {
    scrollen(y); schwebe.letztes = scrollStelle();
    const frei = () => { box.style.minHeight = ""; };
    const offen = [...box.querySelectorAll("img.gross")].filter(i => !i.complete);
    let rest = offen.length;
    if (!rest) frei();
    for (const i of offen) for (const art of ["load", "error"]) i.addEventListener(art, () => { if (--rest <= 0) frei(); }, { once: true });
    setTimeout(frei, 2000); // falls ein Foto nie fertig wird
  }
}

/* ---------- Zurück-Leiste beim Hochwischen (seit 0.26, Wunsch 18.11.2026) ----------
   Ist der Kopf mit „‹ Zurück“ aus dem Bild gescrollt, gleitet beim Hochwischen (ab HOCH Pixeln) eine Leiste mit „‹ Zurück“ und
   „↑ Nach oben“ von oben herein; beim Runterwischen verschwindet sie wieder. Nicht auf der Startseite und nicht beim Tippen in ein
   Feld (dort würde sie über der Tastatur springen). */
const HOCH = 24;
const schwebe = { an: false, letztes: 0, hoch: 0, ruhe: 0 };
const tipptGerade = () => !!document.activeElement?.matches?.("input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, select");
function schwebeZeigen(an) {
  if (schwebe.an === an) return;
  schwebe.an = an; $("schwebe").classList.toggle("zeigen", an);
}
// Nach jedem Ansichtswechsel: Leiste weg, und der Sprung an die gemerkte Stelle zählt nicht als Hochwischen
function schwebeNeu() { schwebeZeigen(false); schwebe.letztes = scrollStelle(); schwebe.hoch = 0; }
function schwebePruefen() {
  const rahmen = $("rahmen"), y = rahmen.scrollTop, unten = rahmen.scrollHeight - rahmen.clientHeight;
  const d = y - schwebe.letztes; schwebe.letztes = y;
  if (current.v === "start" || tipptGerade() || Date.now() < schwebe.ruhe) { schwebe.hoch = 0; return schwebeZeigen(false); }
  // Solange der Kopf mit dem eigenen „‹ Zurück“ noch zu sehen ist, braucht es die Leiste nicht
  const kopfZeile = $("ansicht").querySelector(".kopf-zeile");
  const kopfSichtbar = !!kopfZeile && kopfZeile.getBoundingClientRect().bottom > rahmen.getBoundingClientRect().top;
  if (y <= 0 || kopfSichtbar) { schwebe.hoch = 0; return schwebeZeigen(false); }
  if (y >= unten - 1) return; // Nachfedern am unteren Rand (iPhone) ist kein Hochwischen
  if (d < 0) { schwebe.hoch -= d; if (schwebe.hoch >= HOCH) schwebeZeigen(true); }
  else if (d > 0) { schwebe.hoch = 0; schwebeZeigen(false); }
}
function schwebeEinrichten() {
  const rahmen = $("rahmen");
  $("schwebeZurueck").onclick = () => { schwebeZeigen(false); zurueckTippen(); };
  // Beim sanften Hochscrollen nicht gleich wieder einblenden
  $("schwebeHoch").onclick = () => { schwebeZeigen(false); schwebe.ruhe = Date.now() + 1200; rahmen.scrollTo({ top: 0, behavior: "smooth" }); };
  let geplant = false;
  rahmen.addEventListener("scroll", () => {
    if (geplant) return;
    geplant = true; requestAnimationFrame(() => { geplant = false; schwebePruefen(); });
  }, { passive: true });
  document.addEventListener("focusin", () => { if (tipptGerade()) schwebeZeigen(false); });
}
// Von außen (z. B. nach dem Speichern neuer Teile): nur neu zeichnen, wenn dabei nichts Eingetipptes verloren geht
export async function refresh() { if (!["stil", "sicherung", "fertigEins", "vinted"].includes(current.v) && !bearbeitet) await neuZeichnen(); }
// Jede Zeichnung bekommt eine Nummer. Wird eine ältere erst nach einer neueren fertig (sehr schnelles Tippen),
// zeichnet sie nicht mehr – sonst stünde die falsche Ansicht da.
let zeichnung = 0;
async function render() {
  const nr = ++zeichnung, s = current;
  await customReady;
  const [items, folders, stil, letzte, foto] = await Promise.all([
    s.v === "teil" ? getItem(s.nr).then(t => t ? [t] : []) : allItems(),
    getFolders(), getStil(), getMeta("letzteSicherung"), s.v === "teil" ? getPhoto(s.nr) : null]);
  const [sonst, naechste, outfits] = await Promise.all([getMeta("sonstGeaendert"), getMeta("naechsteNr"), getOutfits()]);
  if (nr !== zeichnung) return;
  merkeMarken(items); // Vorschläge beim Eintippen der Marke
  urls.forEach(u => URL.revokeObjectURL(u)); urls = [];
  // Auswahl-Felder der vorigen Ansicht abmelden (sie hören sonst weiter auf neue eigene Einträge)
  const box = $("ansicht"); box.dispose?.(); box.dispose = null;
  if (s.v === "liste") return renderListe(items, folders, s.id);
  if (s.v === "teil") return renderTeil(items, folders, s.nr, foto);
  if (s.v === "korb") return renderKorb(items, naechste);
  if (s.v === "stil") return renderStil(box, kopf("Mein Stil"), stil);
  if (s.v === "passt") {
    const t = items.find(x => x.nr === s.nr);
    if (!t) return back();
    return renderPasst(box, kopf("Was passt dazu?", `Zu Nr. ${nrText(t.nr)} – ${beschreibung(t)}`,
      neuKnopf(() => passtHatEtwas(t.nr), () => chatHatAntwort({ teil: t }), () => passtNeu(t.nr))), items, folders, stil, s.nr, url, n => go({ v: "teil", nr: n }), neuZeichnen);
  }
  if (s.v === "outfit") return renderOutfit(box, kopf("Outfit finden", null, neuKnopf(outfitHatEtwas, () => chatHatAntwort({}), outfitNeu)),
    items, folders, stil, url, n => go({ v: "teil", nr: n }), neuZeichnen);
  if (s.v === "vinted") {
    const t = items.find(x => x.nr === s.nr);
    if (!t || t.geloescht) return back();
    return renderVinted(box, kopf("🏷 Für Vinted", `Nr. ${nrText(t.nr)} – ${beschreibung(t)}`), t, url);
  }
  if (s.v === "sicherung") return renderZip(box, kopf("Sicherung"), items, letzte, stil, sonst, neuZeichnen);
  if (s.v === "fertig") return renderFertigListe(box, kopf("⭐ Fertige Outfits"), outfits, items, url, id => go({ v: "fertigEins", id }),
    // Zusammenstellen beginnt ohne Suche und Filter (seit 0.25: vorher galten die aus „Mein Kleiderschrank“ mit)
    () => { if (!sichtbar(items).length) return toast("Speichere zuerst Kleidung, dann kannst du Outfits zusammenstellen."); filters.delete(ZUSAMMEN); go({ v: "liste", id: ALLE, zusammenstellen: true }); });
  if (s.v === "fertigEins") {
    const o = outfits.find(x => x.id === s.id);
    if (!o) return back();
    return renderFertig(box, kopf(o.name), o, items, url, t => miniKachel(t, url, n => go({ v: "teil", nr: n })), bildPaketBereich, back, neuZeichnen);
  }
  renderStart(items, folders, stil, letzte, sonst, naechste, outfits);
}
// rechts: Knopf oben rechts (z. B. „Auswählen“)
const kopf = (titel, unter, rechts = null) => el("div", { class: "kopf" },
  el("div", { class: "kopf-zeile" }, el("button", { type: "button", class: "zurueck", onclick: zurueckTippen }, "‹ Zurück"), rechts),
  el("h2", {}, titel), unter ? el("div", { class: "hint" }, unter) : null);
const anzahl = n => `${n} ${n === 1 ? "Teil" : "Teile"}`;

/* ---------- Startseite: Ordner-Kacheln ---------- */
// fotos = welche Teile das Mosaik zeigt (sonst die ersten der Liste)
function kachel(name, list, onclick, fotos = list) {
  const bilder = fotos.slice(0, 4).map(t => el("img", { src: url(t.vorschau), alt: "", loading: "lazy" }));
  return el("button", { type: "button", class: "kachel", onclick },
    el("span", { class: bilder.length === 1 ? "mosaik eins" : "mosaik" }, ...bilder),
    el("span", { class: "name" }, name), el("span", { class: "anzahl" }, anzahl(list.length)));
}
// Abwechselnd aus mehreren Listen (je eins, dann das nächste …), damit das Mosaik von „Aussortiert“ von jedem Bereich etwas zeigt
function gemischt(...listen) {
  const out = [];
  for (let i = 0; listen.some(l => i < l.length); i++) for (const l of listen) if (i < l.length) out.push(l[i]);
  return out;
}
// Nummern wieder bei 001 beginnen: nur, wenn es gar keine Teile mehr gibt. Sind sie nur noch im Papierkorb, ein Hinweis darauf.
function nummernKarte(items, naechste) {
  if (!(naechste > 1) || items.some(t => !t.geloescht)) return null;
  if (items.length) return el("p", { class: "hint" }, "Sobald auch der Papierkorb leer ist, kannst du die Nummern wieder bei 001 beginnen lassen.");
  const knopf = el("button", { type: "button", class: "btn" }, "Nummern wieder bei 001 beginnen");
  knopf.onclick = async () => {
    if (!confirm("Nummern wieder bei 001 beginnen?\n\nEs sind keine Teile mehr da. Ordner, „Mein Stil“ und eigene Knöpfe bleiben. Fertige Outfits werden gelöscht, weil ihre Nummern sonst zu den neuen Teilen passen würden.\n\nAlte Antworten von ChatGPT oder Gemini und alte Sicherungen nennen noch die alten Nummern. Dieselbe Nummer kann dann ein anderes Teil bekommen.")) return;
    try {
      toast(await nummernZuruecksetzen() ? "Das nächste Teil bekommt Nr. 001" : "Das geht nur, wenn keine Teile mehr da sind.");
      neuZeichnen();
    } catch (e) { fehlerToast("Hat nicht geklappt", e); }
  };
  return el("div", { class: "panel" }, el("strong", {}, "🔢 Nummern"),
    el("div", { class: "hint" }, `Dein Kleiderschrank ist leer, das nächste Teil bekäme aber Nr. ${nrText(naechste)}.`),
    el("div", { class: "actions" }, knopf));
}
// Kleine Kachel unter dem Kleiderschrank (Mein Stil, Sicherung, Papierkorb): Name und kurzer Stand
const nebenKachel = (name, stand, onclick, faellig = false) => el("button", { type: "button", class: faellig ? "faellig" : "", onclick },
  el("span", { class: "name" }, name), el("span", { class: "stand" }, stand));
function renderStart(items, folders, stil, letzte, sonst, naechste, outfits) {
  const da = sichtbar(items).sort((a, b) => b.nr - a.nr), korb = items.filter(t => t.geloescht).length;
  // Oben nur, wenn etwas zu tun ist: Sicherung fällig oder (leerer Kleiderschrank) „Sicherung laden?“
  fill($("startHinweis"), zipHinweis(items, letzte, stil, sonst, () => go({ v: "sicherung" })));
  // „Outfit finden“ braucht gespeicherte Kleidung; vorher nur ein freundlicher Hinweis statt einer leeren Seite
  const outfitKnopf = $("outfitKnopf");
  outfitKnopf.classList.toggle("leer", !da.length);
  outfitKnopf.onclick = () => da.length ? go({ v: "outfit" }) : toast("Sobald du Kleidung gespeichert hast, geht es hier los.");
  const kurz = stilKurz(stil), zip = zipKurz(items, letzte, stil, sonst);
  fill($("nebenKacheln"),
    nebenKachel("✨ Mein Stil", kurz.length ? `${kurz.length} ${kurz.length === 1 ? "Angabe" : "Angaben"}` : "einstellen", () => go({ v: "stil" })),
    nebenKachel("💾 Sicherung", zip.text, () => go({ v: "sicherung" }), zip.faellig),
    nebenKachel("🗑 Papierkorb", korb ? anzahl(korb) : "leer", () => go({ v: "korb" })));
  const neu = el("button", { type: "button", class: "kachel neu" }, el("span", { class: "plus" }, "+"), el("span", { class: "name" }, "Neuer Ordner"));
  neu.onclick = () => nameEditor($("ordnerEditor"), "", folders, async name => {
    const f = { id: "o" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name };
    await setFolders([...folders, f]); ordnerMelden();
    toast(`Ordner „${name}“ angelegt`);
    go({ v: "liste", id: f.id });
  });
  // „♻️ Aussortiert“: öffnet den zuletzt gewählten Bereich, sonst „Zum Verkaufen“, sonst den ersten mit Teilen
  const bereiche = { [NICHT]: nichtAn(da), [L_VERKAUF]: da.filter(imVerkauf), [L_VERKAUFT]: verkaufteVon(items) };
  const aussortiert = AUSSORTIERT.flatMap(b => bereiche[b]);
  const ersterBereich = () => [aussortiertZuletzt, L_VERKAUF, NICHT, L_VERKAUFT].find(b => b && bereiche[b].length);
  fill($("kacheln"),
    kachel(HAUPT, da, () => go({ v: "liste", id: ALLE })),
    ...folders.map(f => kachel(f.name, da.filter(t => t.ordner?.includes(f.id)), () => go({ v: "liste", id: f.id }))),
    aussortiert.length ? kachel(AUSSORTIERT_NAME, aussortiert, () => go({ v: "liste", id: ersterBereich() }), gemischt(...AUSSORTIERT.map(b => bereiche[b]))) : null,
    da.length || outfits.length ? fertigKachel(outfits, items, url, () => go({ v: "fertig" })) : null,
    neu);
  $("ordnerEditor").replaceChildren(); $("ordnerEditor").hidden = true;
  fill($("nummernKarte"), nummernKarte(items, naechste));
}
// Name für neuen oder umbenannten Ordner eingeben (max. 30 Zeichen, nicht doppelt)
function nameEditor(box, start, folders, onOk, selfId = null) {
  const input = el("input", { type: "text", maxLength: 30, value: start, placeholder: "z. B. Sommer, Arbeit, Urlaub", "aria-label": "Name des Ordners", autocomplete: "off" });
  const msg = el("div", { class: "note" }), ok = el("button", { type: "button", class: "btn primary" }, start ? "Speichern" : "Anlegen");
  const close = () => { box.hidden = true; box.replaceChildren(); };
  ok.onclick = async () => {
    const name = clean(input.value), lower = name.toLowerCase();
    if (!name) { msg.textContent = "Bitte einen Namen eintippen."; return; }
    if (FESTE_NAMEN.some(n => n.toLowerCase() === lower) || folders.some(f => f.id !== selfId && f.name.toLowerCase() === lower)) {
      msg.textContent = "Diesen Namen gibt es schon."; return;
    }
    ok.disabled = true;
    try { await onOk(name); } catch (e) { msg.textContent = "Hat nicht geklappt: " + fehlerText(e); ok.disabled = false; }
  };
  input.onkeydown = e => { if (e.key === "Enter") ok.click(); };
  box.replaceChildren(el("div", { class: "eigen-edit" }, input, msg,
    el("div", { class: "actions" }, el("button", { type: "button", class: "btn", onclick: close }, "Abbrechen"), ok)));
  box.hidden = false; input.focus();
}

/* ---------- Ordner-Ansicht mit Filtern und Suche ---------- */
const filters = new Map(); // pro Ordner gemerkt, solange die App offen ist: { gruppe, farbe, suche }
const ZUSAMMEN = "zusammenstellen"; // eigene Filter beim „＋ Eigenes Outfit zusammenstellen“
let auswahl = null;        // „Teile auswählen“: Set der Nummern, die im Ordner sein sollen (sonst null)
function teilKachel(t, { markiert = null, onclick, extra = null }) {
  // Zeichen unten rechts: 🚫 Ziehe ich nicht an, dazu seit 0.26 💰 will ich verkaufen / 📦 bei Vinted / ✅ verkauft
  const zeichen = [t.nichtAnziehen ? "🚫" : null, verkaufZeichen(t)].filter(Boolean).join(" ");
  const b = el("button", { type: "button", class: "teil" + (markiert ? " markiert" : "") },
    el("span", { class: "bild" }, el("img", { src: url(t.vorschau), alt: beschreibung(t), loading: "lazy" }),
      el("span", { class: "plakette" }, nrText(t.nr)), markiert !== null ? el("span", { class: "haken" }, markiert ? "✓" : "") : null,
      zeichen ? el("span", { class: "nicht", title: [t.nichtAnziehen ? "Ziehe ich nicht an" : null, verkaufKurz(t)].filter(Boolean).join(", ") }, zeichen) : null),
    el("span", { class: "text" }, `Nr. ${nrText(t.nr)} – ${beschreibung(t)}`), extra);
  b.onclick = onclick;
  if (markiert !== null) b.setAttribute("aria-pressed", markiert);
  return b;
}
// Kachel im Auswahl-Modus an- oder abhaken, ohne die Ansicht neu zu zeichnen
function haken(b, an) { b.classList.toggle("markiert", an); b.setAttribute("aria-pressed", an); b.querySelector(".haken").textContent = an ? "✓" : ""; }
// Leiste unten im Auswahl-Modus: Anzahl, „Alle auswählen“ und Knöpfe, die für alle angetippten Teile gelten.
// kacheln() = die gerade sichtbaren Kacheln (Suche/Filter), aktionen = [{ text, los(nrs), haupt }] (haupt = hervorgehoben)
function auswahlLeiste(kacheln, aktionen) {
  const zahl = el("span", {}), alle = el("button", { type: "button", class: "link" });
  const extra = el("div", { class: "leiste-extra" }); extra.hidden = true; // z. B. „In welchen Ordner?“
  const knoepfe = aktionen.map(a => {
    const b = el("button", { type: "button", class: a.haupt ? "btn klein primary" : "btn klein" }, a.text);
    b.onclick = async () => {
      if (!mehrfach?.size) return;
      try { await a.los([...mehrfach]); } catch (e) { fehlerToast("Hat nicht geklappt", e); console.error(e); }
    };
    return b;
  });
  const alleDrin = () => { const s = kacheln(); return s.length > 0 && s.every(k => mehrfach.has(Number(k.dataset.nr))); };
  const update = () => {
    const n = mehrfach.size;
    zahl.textContent = n ? `${anzahl(n)} ausgewählt` : "Tippe die Teile an";
    knoepfe.forEach(b => { b.disabled = !n; });
    alle.textContent = alleDrin() ? "Keine auswählen" : "Alle auswählen";
  };
  alle.onclick = () => {
    const an = !alleDrin();
    for (const k of kacheln()) { const nr = Number(k.dataset.nr); an ? mehrfach.add(nr) : mehrfach.delete(nr); haken(k, an); }
    update();
  };
  update();
  return { el: el("div", { class: "leiste" }, el("div", { class: "leiste-kopf" }, zahl, alle), extra, el("div", { class: "actions wrap" }, ...knoepfe)), update, extra };
}
// Nach einer Aktion: Auswahl beenden, Meldung zeigen, neu zeichnen
const fertigMit = text => { mehrfach = null; toast(text); neuZeichnen(); };
function filterChips(list, f, onChange) {
  // Nur Gruppen und Farben anzeigen, die es hier gibt, mit Anzahl. Ein Tippen auf den gewählten Knopf hebt ihn auf.
  const count = (arr, key) => arr.reduce((m, t) => { for (const k of [].concat(key(t) ?? [])) m.set(k, (m.get(k) || 0) + 1); return m; }, new Map());
  const gruppen = count(list, t => t.gruppe || "Sonstiges");
  const imFilter = f.gruppe ? list.filter(t => (t.gruppe || "Sonstiges") === f.gruppe) : list;
  const farben = count(imFilter, t => t.farben);
  const row = (entries, key, withSwatch) => {
    const all = el("button", { type: "button", class: "chip" }, "Alle");
    all.setAttribute("aria-pressed", !f[key]); all.onclick = () => onChange({ ...f, [key]: null });
    return el("div", { class: "chips" }, all, ...entries.map(([k, n]) => {
      const b = el("button", { type: "button", class: "chip" }, withSwatch ? swatch(k) : null, `${k} (${n})`);
      b.setAttribute("aria-pressed", f[key] === k); b.onclick = () => onChange({ ...f, [key]: f[key] === k ? null : k });
      return b;
    }));
  };
  const rank = g => { const i = GROUP_ORDER.indexOf(g); return i < 0 ? 99 : i; }; // eigene/fehlende Gruppen ans Ende
  const sortedGroups = [...gruppen].sort((a, b) => rank(a[0]) - rank(b[0]));
  // Eine Zeile nur zeigen, wenn es etwas zu wählen gibt – oder wenn ein Filter aktiv ist (sonst käme man nicht mehr heraus)
  return el("div", { class: "filter" },
    sortedGroups.length > 1 || f.gruppe ? field("Art", null, row(sortedGroups, "gruppe")) : null,
    farben.size > 1 || f.farbe ? field("Farbe", null, row([...farben].sort((a, b) => b[1] - a[1]), "farbe", true)) : null);
}
// Suche: nur Ziffern (auch „Nr. 12“) = Nummer; sonst Wörter, die alle in den Angaben vorkommen müssen (z. B. „jeans blau“)
// Seit 0.25 (Durchsicht 11.11.2026): Ziffern finden genau diese Nummer („12“ und „012“ = Nr. 012, nicht mehr auch 120–129)
// und dieselbe Größe („38“ = Nr. 038 und Teile in Größe 38)
function passtSuche(t, q) {
  q = q.trim().toLowerCase().replace(/^nr\.?\s*/, "");
  if (!q) return true;
  if (/^\d+$/.test(q)) return t.nr === Number(q) || String(t.groesse || "").toLowerCase().split(/[\s/]+/).includes(q);
  const text = [t.art, t.gruppe, ...(t.farben || []), t.muster, t.material, t.aermel, t.schnitt, t.weite, t.laenge, t.bund,
    ...(t.stil || []), ...(t.saison || []), t.notiz, t.marke, t.groesse, t.zustand].filter(Boolean).join(" ").toLowerCase();
  return q.split(/\s+/).every(w => text.includes(w));
}
// Zeile unter dem Titel der Verkaufs-Ordner (seit 0.26)
const summeVon = (list, feld) => Math.round(list.reduce((s, t) => s + (t[feld] || 0), 0) * 100) / 100;
// „Will ich verkaufen: 2 · Bei Vinted: 1 (zusammen 15 €)“ – Bereiche mit 0 Teilen fallen weg (iPhone-Test: „0 will ich verkaufen“)
function verkaufUnter(list) {
  const bei = list.filter(t => t.verkauf === EINGESTELLT), summe = summeVon(bei, "preis"), wollen = list.length - bei.length;
  const teile = [wollen ? `Will ich verkaufen: ${wollen}` : null, bei.length ? `Bei Vinted: ${bei.length}${summe ? ` (zusammen ${preisText(summe)})` : ""}` : null].filter(Boolean);
  return (teile.length ? teile.join(" · ") + "." : "") + (list.length === 1 ? " Es kommt nicht in Outfit-Vorschläge." : " Sie kommen nicht in Outfit-Vorschläge.");
}
function verkauftUnter(list) {
  const mit = list.filter(t => t.erloes != null), ohne = list.length - mit.length;
  return `${anzahl(list.length)} verkauft${mit.length ? `, zusammen ${preisText(summeVon(mit, "erloes"))}` : ""}${mit.length && ohne ? ` (bei ${ohne} ohne Betrag)` : ""}.` +
    (list.length === 1 ? " Es ist nicht mehr im Kleiderschrank und kommt in keine Vorschläge." : " Sie sind nicht mehr im Kleiderschrank und kommen in keine Vorschläge.");
}
function renderListe(items, folders, id) {
  const fest = [ALLE, NICHT, L_VERKAUF, L_VERKAUFT].includes(id), verkaufListe = id === L_VERKAUF || id === L_VERKAUFT;
  const ordner = fest ? null : folders.find(f => f.id === id);
  if (!fest && !ordner) { auswahl = null; return back(); }
  const da = sichtbar(items).sort((a, b) => b.nr - a.nr);
  // „Zum Verkaufen“: zuerst, was schon bei Vinted ist (am längsten online oben), dann „will ich verkaufen“
  const zumVerkauf = () => da.filter(imVerkauf).sort((a, b) => (a.verkauf === EINGESTELLT ? 0 : 1) - (b.verkauf === EINGESTELLT ? 0 : 1)
    || (a.eingestelltAm || "").localeCompare(b.eingestelltAm || "") || b.nr - a.nr);
  const drin = ordner ? da.filter(t => t.ordner?.includes(id)) : id === NICHT ? nichtAn(da)
    : id === L_VERKAUF ? zumVerkauf() : id === L_VERKAUFT ? verkaufteVon(items) : da;
  // „♻️ Aussortiert“: oben drei Knöpfe zum Umschalten (ersetzt die Ansicht, „Zurück“ führt weiter zur Startseite)
  const imAussortiert = AUSSORTIERT.includes(id);
  if (imAussortiert) aussortiertZuletzt = id;
  const umschalter = imAussortiert ? el("div", { class: "chips umschalter" }, ...AUSSORTIERT.map(b => {
    const n = (b === NICHT ? nichtAn(da) : b === L_VERKAUF ? da.filter(imVerkauf) : verkaufteVon(items)).length;
    // Ein Knopf je Bereich: oben Zeichen und Anzahl, darunter der Name (drei passen nebeneinander, auch bei 320 px)
    const [zeichen, wort] = BEREICH_NAME[b];
    const k = el("button", { type: "button", class: "chip", "aria-label": `${wort}: ${anzahl(n)}` },
      el("span", { class: "zahl" }, `${zeichen} ${n}`), el("span", { class: "wort" }, wort));
    k.setAttribute("aria-pressed", b === id);
    k.onclick = () => { if (b !== id) ersetze({ v: "liste", id: b }); };
    return k;
  })) : null;
  // In den Verkaufs-Ordnern steht unter jedem Foto der Stand („📦 seit 6 Tagen bei Vinted · 15 €“)
  const standVon = t => verkaufListe ? el("span", { class: "rest" }, verkaufKurz(t)) : null;
  const filterName = current.zusammenstellen ? ZUSAMMEN : id;
  const f = filters.get(filterName) || { gruppe: null, farbe: null, suche: "" };
  filters.set(filterName, f);
  const basis = auswahl ? da : drin; // beim Auswählen alle Teile zeigen
  const gefiltert = basis.filter(t => (!f.gruppe || (t.gruppe || "Sonstiges") === f.gruppe) && (!f.farbe || t.farben?.includes(f.farbe)));
  const editor = el("div", {}); editor.hidden = true;

  let aktionen = null, fertigKnopf = null;
  if (ordner && auswahl) {
    const fertig = fertigKnopf = el("button", { type: "button", class: "btn primary" }, `Fertig (${anzahl(auswahl.size)})`);
    fertig.onclick = async () => {
      fertig.disabled = true;
      try { await setFolderItems(id, auswahl); auswahl = null; toast("Ordner gespeichert"); neuZeichnen(); }
      catch (e) { fertig.disabled = false; fehlerToast("Speichern hat nicht geklappt", e); }
    };
    aktionen = el("div", {}, el("div", { class: "hint" }, `Tippe die Teile an, die in „${ordner.name}“ sein sollen. In „${HAUPT}“ bleiben sie immer.`),
      el("div", { class: "actions" }, el("button", { type: "button", class: "btn", onclick: () => { auswahl = null; neuZeichnen(); } }, "Abbrechen"), fertig));
  } else if (ordner) {
    const waehlen = el("button", { type: "button", class: "btn primary", onclick: () => { auswahl = new Set(drin.map(t => t.nr)); neuZeichnen(); } }, "Teile hinzufügen / entfernen");
    const umbenennen = el("button", { type: "button", class: "btn" }, "Umbenennen");
    umbenennen.onclick = () => nameEditor(editor, ordner.name, folders, async name => {
      await setFolders(folders.map(x => x.id === id ? { ...x, name } : x)); ordnerMelden(); toast("Umbenannt"); neuZeichnen();
    }, id);
    const loeschen = el("button", { type: "button", class: "btn" }, "Ordner löschen");
    loeschen.onclick = async () => {
      const teile = drin.length === 1 ? "Das 1 Teil darin wird NICHT gelöscht, es bleibt" : `Die ${anzahl(drin.length)} darin werden NICHT gelöscht, sie bleiben`;
      if (!confirm(`Ordner „${ordner.name}“ löschen?\n\n${teile} in „${HAUPT}“.`)) return;
      try { await deleteFolder(id); ordnerMelden(); toast("Ordner gelöscht"); back(); } catch (e) { fehlerToast("Löschen hat nicht geklappt", e); }
    };
    aktionen = el("div", { class: "actions wrap" }, waehlen, umbenennen, loeschen);
  }
  const leer = basis.length ? (gefiltert.length ? null : "Mit diesem Filter gibt es hier nichts.")
    : ordner ? "Noch keine Teile in diesem Ordner. Tippe auf „Teile hinzufügen / entfernen“."
    : id === NICHT ? "Keine Teile mehr markiert."
    : id === L_VERKAUF ? "Hier ist nichts mehr. Ein Teil kommt hierher, wenn du bei ihm „💰 Will ich verkaufen“ antippst."
    : id === L_VERKAUFT ? "Noch nichts verkauft." : "Noch nichts gespeichert. Füge auf der Startseite Kleidung hinzu.";
  const unter = auswahl ? null : ordner ? anzahl(drin.length)
    : id === NICHT ? `${anzahl(drin.length)}, ${drin.length === 1 ? "das nie in Outfit-Vorschläge kommt" : "die nie in Outfit-Vorschläge kommen"}. Zum Zurückholen: Teil antippen und „Ziehe ich nicht an“ ausschalten. Zum Verkaufen: „Auswählen“ und „💰 Verkaufen“.`
    : id === L_VERKAUF ? verkaufUnter(drin) : id === L_VERKAUFT ? verkauftUnter(drin)
    : `Alle ${anzahl(drin.length)}`;
  // Bei Vinted schon lange online: Hinweis oben (nur beim Öffnen der App, eine Mitteilung aufs Handy gibt es nicht)
  const lange = id === L_VERKAUF && !mehrfach ? drin.filter(langeOnline) : [];
  const langeHinweis = lange.length ? el("div", { class: "panel hinweis" }, el("strong", {}, "⏰ Schon lange bei Vinted"),
    el("p", {}, `${lange.map(t => "Nr. " + nrText(t.nr)).join(", ")} ${lange.length === 1 ? "ist" : "sind"} seit über ${LANGE_TAGE} Tagen online. Vielleicht den Preis bei Vinted etwas senken oder den Artikel neu einstellen?`)) : null;

  // „＋ Eigenes Outfit zusammenstellen“ (aus „⭐ Fertige Outfits“): alle Teile antippen, unten nur „⭐ Als Outfit speichern“
  const zusammen = !!current.zusammenstellen && id === ALLE && !!mehrfach;
  // „Auswählen“ oben rechts: mehrere Teile antippen und gemeinsam verschieben, in einen Ordner legen, 🚫 markieren oder löschen
  const waehlenKnopf = !auswahl && basis.length ? el("button", { type: "button", class: "kopf-knopf" }, zusammen ? "Abbrechen" : mehrfach ? "Fertig" : "Auswählen") : null;
  if (waehlenKnopf) waehlenKnopf.onclick = zusammen ? back : () => { mehrfach = mehrfach ? null : new Set(); neuZeichnen(); };
  if (mehrfach) aktionen = null;
  let leiste = null;

  const teilVon = new Map(gefiltert.map(t => [t.nr, t]));
  const grid = el("div", { class: "grid" }, ...gefiltert.map(t => {
    const k = auswahl
      // Nur den Haken umschalten statt alles neu zu zeichnen (seit 0.25: bei 300 Teilen stockte sonst jedes Tippen)
      ? teilKachel(t, { markiert: auswahl.has(t.nr), onclick: () => {
          auswahl.has(t.nr) ? auswahl.delete(t.nr) : auswahl.add(t.nr); haken(k, auswahl.has(t.nr));
          if (fertigKnopf) fertigKnopf.textContent = `Fertig (${anzahl(auswahl.size)})`;
        } })
      : mehrfach
      ? teilKachel(t, { markiert: mehrfach.has(t.nr), extra: standVon(t), onclick: () => { mehrfach.has(t.nr) ? mehrfach.delete(t.nr) : mehrfach.add(t.nr); haken(k, mehrfach.has(t.nr)); leiste.update(); } })
      : teilKachel(t, { extra: standVon(t), onclick: () => go({ v: "teil", nr: t.nr }) });
    k.dataset.nr = t.nr; return k;
  }));
  if (mehrfach) {
    const alleTeile = new Map(items.map(t => [t.nr, t])), ordnerVon = nr => alleTeile.get(nr)?.ordner || [];
    // Ordner zum Verschieben/Hinzufügen erscheint in der Leiste
    const ordnerWahl = (frage, los) => {
      const ziele = folders.filter(f => f.id !== id);
      if (!ziele.length) return toast("Lege zuerst auf der Startseite einen Ordner an („+ Neuer Ordner“).");
      fill(leiste.extra, el("div", { class: "note" }, frage),
        el("div", { class: "chips" }, ...ziele.map(f => el("button", { type: "button", class: "chip", onclick: () => los(f).catch(e => fehlerToast("Hat nicht geklappt", e)) }, f.name)),
          el("button", { type: "button", class: "chip", onclick: () => { leiste.extra.hidden = true; } }, "Abbrechen")));
      leiste.extra.hidden = false;
    };
    const n = nrs => anzahl(nrs.length);
    // „⭐ Als Outfit speichern“ (Wunsch 07.11.2026): Name freiwillig, dann gleich das gespeicherte Outfit öffnen
    const zuViele = k => toast(`Ein Outfit hat höchstens ${MAX_TEILE} Teile, ausgewählt ${k === 1 ? "ist" : "sind"} ${k}.`);
    let nameFeld = null;
    const alsOutfit = { text: "⭐ Als Outfit speichern", haupt: zusammen, los: async nrs => {
      if (nrs.length > MAX_TEILE) return zuViele(nrs.length);
      // Ist das Namensfeld schon offen, nur dorthin springen (vorher löschte ein zweites Tippen den eingetippten Namen)
      if (nameFeld?.isConnected && !leiste.extra.hidden) { nameFeld.focus(); return; }
      const name = nameFeld = el("input", { type: "text", class: "suche", maxLength: MAX_NAME, placeholder: "z. B. Büro am Freitag", "aria-label": "Name des Outfits (freiwillig)", autocomplete: "off", enterKeyHint: "done" });
      const ok = el("button", { type: "button", class: "btn primary" }, "Speichern");
      ok.onclick = async () => {
        const jetzt = [...(mehrfach || [])]; // was gerade angetippt ist (auch nach dem Öffnen dieses Felds noch änderbar)
        if (!jetzt.length) return toast("Tippe zuerst die Teile an.");
        if (jetzt.length > MAX_TEILE) return zuViele(jetzt.length);
        ok.disabled = true;
        try {
          const r = await outfitSpeichern(jetzt, clean(name.value) || "Eigenes Outfit", null, "eigen");
          if (r.da) { ok.disabled = false; return toast(`Ist schon gespeichert als „${r.da.name}“`); }
          toast("In „⭐ Fertige Outfits“ gespeichert");
          (zusammen ? ersetze : go)({ v: "fertigEins", id: r.neu.id });
        } catch (e) { ok.disabled = false; fehlerToast("Speichern hat nicht geklappt", e); console.error(e); }
      };
      name.onkeydown = e => { if (e.key === "Enter") ok.click(); };
      fill(leiste.extra, el("div", { class: "note" }, "Name für das Outfit (freiwillig):"), name,
        el("div", { class: "actions" }, el("button", { type: "button", class: "btn", onclick: () => { leiste.extra.hidden = true; } }, "Abbrechen"), ok));
      leiste.extra.hidden = false;
      name.focus();
    } };
    const loeschen = { text: "Löschen", los: async nrs => {
      if (!confirm(`${n(nrs)} löschen?\n\n${nrs.length === 1 ? "Es kommt" : "Sie kommen"} in den Papierkorb, ${nrs.length === 1 ? "bleibt" : "bleiben"} dort ${KORB_TAGE} Tage und ${nrs.length === 1 ? "lässt" : "lassen"} sich wiederherstellen.`)) return;
      const jetzt = new Date().toISOString();
      await updateItems(nrs.map(nr => ({ nr, geloescht: jetzt })));
      fertigMit(`${n(nrs)} im Papierkorb`);
    } };
    // Verkaufen für mehrere auf einmal (seit 0.26), z. B. beim Ausmisten. Teile, die schon dabei sind, behalten ihren Stand.
    const verkaufen = { text: "💰 Verkaufen", los: async nrs => {
      const neu = nrs.filter(nr => !alleTeile.get(nr)?.verkauf);
      await updateItems(neu.map(nr => ({ nr, ...KEIN_VERKAUF, verkauf: ZUM_VERKAUF })));
      fertigMit(neu.length ? `${n(neu)} in „${VERKAUF_NAME}“` : "Die ausgewählten Teile sind schon beim Verkaufen");
    } };
    const verkaufAktionen = id === L_VERKAUF ? [
      { text: "📦 Bei Vinted eingestellt", haupt: true, los: async nrs => {
        const neu = nrs.filter(nr => alleTeile.get(nr)?.verkauf === ZUM_VERKAUF), jetzt = new Date().toISOString();
        await updateItems(neu.map(nr => ({ nr, verkauf: EINGESTELLT, eingestelltAm: jetzt })));
        fertigMit(neu.length ? `${n(neu)} bei Vinted eingestellt` : "Die ausgewählten Teile sind schon eingestellt");
      } },
      { text: "✅ Verkauft", los: async nrs => {
        if (!confirm(`${n(nrs)} als verkauft eintragen?\n\nDanach ${nrs.length === 1 ? "ist es" : "sind sie"} nicht mehr im Kleiderschrank, nur noch unter „${VERKAUFT_NAME}“. Als Betrag gilt der Preis bei Vinted (falls eingetragen), ändern kannst du ihn beim Teil.`)) return;
        const jetzt = new Date().toISOString();
        await updateItems(nrs.map(nr => ({ nr, verkauf: VERKAUFT, verkauftAm: jetzt, erloes: alleTeile.get(nr)?.preis ?? null })));
        fertigMit(`${n(nrs)} verkauft 🎉`);
      } },
      { text: "Doch behalten", los: async nrs => {
        // Rückfrage, wenn dabei Preis oder Datum bei Vinted verloren gehen (Durchsicht vor dem Hochladen, 18.11.2026)
        const bei = nrs.filter(nr => alleTeile.get(nr)?.verkauf === EINGESTELLT || alleTeile.get(nr)?.preis != null).length;
        if (bei && !confirm(`${n(nrs)} doch behalten?\n\nBei ${bei === 1 ? "1 Teil gehen" : bei + " Teilen gehen"} der Preis und das Datum bei Vinted verloren. Nimm ${bei === 1 ? "es" : "sie"} auch bei Vinted heraus.`)) return;
        await updateItems(nrs.map(nr => ({ nr, ...KEIN_VERKAUF })));
        fertigMit(`${n(nrs)} ${nrs.length === 1 ? "kommt" : "kommen"} wieder in Vorschläge`);
      } },
      loeschen]
    : id === L_VERKAUFT ? [
      { text: "Doch nicht verkauft", los: async nrs => {
        if (!confirm(`${n(nrs)} doch nicht verkauft?\n\n${nrs.length === 1 ? "Es kommt" : "Sie kommen"} zurück in den Kleiderschrank (unter „${VERKAUF_NAME}“). Verkaufsdatum und Betrag werden gelöscht.`)) return;
        const jetzt = new Date().toISOString();
        await updateItems(nrs.map(nr => ({ nr, verkauf: EINGESTELLT, verkauftAm: null, erloes: null, eingestelltAm: alleTeile.get(nr)?.eingestelltAm || jetzt })));
        fertigMit(`${n(nrs)} wieder im Kleiderschrank (in „${VERKAUF_NAME}“)`);
      } },
      loeschen]
    : null;
    leiste = auswahlLeiste(() => [...grid.children].filter(k => !k.hidden), zusammen ? [alsOutfit] : verkaufAktionen || [
      id !== NICHT && alsOutfit,
      ordner && { text: "Verschieben nach …", los: async nrs => ordnerWahl(`${n(nrs)} aus „${ordner.name}“ verschieben nach:`, async f => {
        await updateItems(nrs.map(nr => ({ nr, ordner: [...new Set([...ordnerVon(nr).filter(o => o !== id), f.id])] })));
        fertigMit(`${n(nrs)} nach „${f.name}“ verschoben`);
      }) },
      { text: ordner ? "Auch in Ordner …" : "In Ordner …", los: async nrs => ordnerWahl(`${n(nrs)} zusätzlich in diesen Ordner legen:`, async f => {
        await updateItems(nrs.map(nr => ({ nr, ordner: [...new Set([...ordnerVon(nr), f.id])] })));
        fertigMit(`${n(nrs)} jetzt auch in „${f.name}“`);
      }) },
      ordner && { text: "Aus Ordner nehmen", los: async nrs => {
        await updateItems(nrs.map(nr => ({ nr, ordner: ordnerVon(nr).filter(o => o !== id) })));
        fertigMit(`${n(nrs)} aus „${ordner.name}“ genommen (${nrs.length === 1 ? "bleibt" : "bleiben"} in „${HAUPT}“)`);
      } },
      { text: id === NICHT ? "Wieder vorschlagen" : "🚫 Nicht anziehen", los: async nrs => {
        await updateItems(nrs.map(nr => ({ nr, nichtAnziehen: id !== NICHT })));
        fertigMit(id === NICHT ? `${n(nrs)} ${nrs.length === 1 ? "kommt" : "kommen"} wieder in Vorschläge` : `${n(nrs)} als „Ziehe ich nicht an“ markiert`);
      } },
      verkaufen,
      loeschen
    ].filter(Boolean));
  }
  // Beim Tippen in die Suche nur Kacheln ein- und ausblenden (neu zeichnen würde die Tastatur schließen)
  const suche = el("input", { type: "search", class: "suche", value: f.suche, placeholder: "Suchen: Nr. oder Wort, z. B. 012 oder Jeans", "aria-label": "Suchen", autocomplete: "off", enterKeyHint: "search" });
  const keinTreffer = el("p", { class: "hint" }, "Nichts gefunden.");
  const suchen = () => {
    f.suche = suche.value;
    let n = 0;
    for (const k of grid.children) { const ok = passtSuche(teilVon.get(Number(k.dataset.nr)), f.suche); k.hidden = !ok; if (ok) n++; }
    keinTreffer.hidden = n > 0 || !gefiltert.length;
    leiste?.update(); // „Alle auswählen“ gilt für die gerade sichtbaren Teile
  };
  suche.oninput = suchen;
  suche.onkeydown = e => { if (e.key === "Enter") suche.blur(); };
  suchen();
  fill($("ansicht"),
    zusammen ? kopf("＋ Eigenes Outfit", `Tippe die Teile an, die zum Outfit gehören (höchstens ${MAX_TEILE}). Dann unten „⭐ Als Outfit speichern“.`, waehlenKnopf)
      : kopf(ordner ? ordner.name : imAussortiert ? AUSSORTIERT_NAME : HAUPT, imAussortiert ? null : unter, waehlenKnopf),
    // In „Aussortiert“ steht die Zeile zum Bereich unter den Knöpfen zum Umschalten
    imAussortiert && !mehrfach ? umschalter : null, imAussortiert && unter ? el("p", { class: "hint aussortiert-unter" }, unter) : null,
    langeHinweis, aktionen, editor,
    basis.length ? suche : null,
    basis.length ? filterChips(basis, f, nf => { filters.set(filterName, nf); neuZeichnen(); }) : null,
    grid, keinTreffer,
    leer ? el("p", { class: "hint" }, leer) : null,
    leiste?.el);
}

/* ---------- Teil-Ansicht ---------- */
const datum = datumText;
let angabenOffen = false; // „Angaben ansehen“ beim Verkaufen: bleibt pro Sitzung offen, wenn sie es aufgeklappt hat
function renderTeil(items, folders, nr, foto) {
  const t = items.find(x => x.nr === nr);
  if (!t) return back();
  const bild = el("img", { class: "gross", src: url(foto || t.vorschau), alt: beschreibung(t) });  bild.onclick = () => zeigeGross(bild.src, beschreibung(t));
  const zeile = (k, v) => v ? [el("dt", {}, k), el("dd", {}, v)] : [];
  const angaben = el("dl", { class: "angaben" },
    ...zeile("Art", t.gruppe ? `${t.gruppe} › ${t.art}` : t.art), ...zeile("Farbe", (t.farben || []).join(" / ")),
    ...zeile("Muster", t.muster), ...zeile("Material", t.material || "noch nicht gewählt"),
    ...zeile("Ärmel", t.aermel), ...zeile("Hosenschnitt", t.schnitt),
    ...zeile("Weite", t.weite), ...zeile("Länge", t.laenge), ...zeile("Bund", t.bund),
    ...zeile("Stil", t.stil?.join(", ")), ...zeile("Saison", t.saison?.join(", ")), ...zeile("Notiz", t.notiz),
    ...zeile("Vorschläge", t.nichtAnziehen ? "🚫 Ziehe ich nicht an" : null),
    ...zeile("Marke", t.marke), ...zeile("Größe", t.groesse), ...zeile("Zustand", t.zustand), ...zeile("Hinzugefügt", datum(t.erstellt)));
  const inhalt = el("div", { class: "panel" }, angaben);

  // Ordner: Änderungen werden sofort gespeichert
  const ordnerFeld = folders.length
    ? field("Ordner", `Immer in „${HAUPT}“. Zusätzlich in:`, choice({
        options: folders.map(f => f.name), selected: folders.filter(f => t.ordner?.includes(f.id)).map(f => f.name), max: 0,
        onChange: async sel => {
          try { await updateItem(nr, { ordner: folders.filter(f => sel.includes(f.name)).map(f => f.id) }); toast("Gespeichert"); }
          catch (e) { fehlerToast("Speichern hat nicht geklappt", e); refresh(); }
        } }).el)
    : field("Ordner", `Liegt in „${HAUPT}“.`, null, "Eigene Ordner (z. B. „Sommer“) legst du auf der Startseite mit „+ Neuer Ordner“ an.");
  // „Ziehe ich nicht an“ mit einem Tippen an/aus, ohne „Angaben ändern“
  const nichtFeld = field("Vorschläge", null, choice({
    options: [NICHT_NAME], selected: t.nichtAnziehen ? [NICHT_NAME] : [],
    onChange: async sel => {
      try {
        await updateItem(nr, { nichtAnziehen: sel.length > 0 });
        // Beim Verkaufen kommt es so oder so nicht in Vorschläge (seit 0.26.1)
        toast(t.verkauf ? (sel.length ? "Gespeichert" : `Gespeichert – kommt erst nach „Doch behalten“ wieder in Vorschläge`)
          : sel.length ? "Kommt nicht mehr in Vorschläge" : "Kommt wieder in Vorschläge");
      }
      catch (e) { fehlerToast("Speichern hat nicht geklappt", e); }
      neuZeichnen();
    } }).el, "Das Teil bleibt im Kleiderschrank, kommt aber nie in Outfit-Vorschläge.");

  const aendern = el("button", { type: "button", class: "btn" }, "Angaben ändern");
  aendern.onclick = () => {
    bearbeitet = true;
    const form = angabenFelder(angabenVon(t), () => { speichern.disabled = !form.get().art; });
    const start = JSON.stringify(form.get());
    geaendert = () => JSON.stringify(form.get()) !== start;
    $("ansicht").dispose = () => form.dispose();
    const fertig = () => { bearbeitet = false; geaendert = () => false; neuZeichnen(); };
    const speichern = el("button", { type: "button", class: "btn primary" }, "Speichern");
    const abbrechen = el("button", { type: "button", class: "btn", onclick: fertig }, "Abbrechen");
    speichern.onclick = async () => {
      speichern.disabled = true;
      try { await updateItem(nr, form.get()); toast("Gespeichert"); fertig(); }
      catch (e) { speichern.disabled = false; fehlerToast("Speichern hat nicht geklappt", e); }
    };
    inhalt.replaceChildren(...form.elements, el("div", { class: "actions" }, abbrechen, speichern));
    // 🚫 steht jetzt im Formular unter „Mehr Angaben“; ein zweiter Schalter würde das Formular verwerfen.
    // „Was passt dazu?“ und „Für Vinted“ während des Änderns ausblenden, sie würden die Ansicht wechseln.
    // Ebenso „Verkaufen“ (zeichnet die Ansicht neu, das Formular wäre weg).
    aktionen.hidden = true; nichtFeld.hidden = true; verkaufBox.hidden = true; if (passt) passt.hidden = true;
    if (klappe) klappe.open = true; // beim Verkaufen sind die Angaben eingeklappt
  };
  const korb = el("button", { type: "button", class: "btn" }, t.geloescht ? "Wiederherstellen" : "In den Papierkorb");
  korb.onclick = async () => {
    korb.disabled = true; // zweimal schnell getippt ging es sonst zwei Schritte zurück (seit 0.25)
    try {
      if (t.geloescht) { await restoreItem(nr); toast(`Nr. ${nrText(nr)} ist wieder da`); neuZeichnen(); }
      else { await trashItem(nr); toast(`Nr. ${nrText(nr)} liegt jetzt im Papierkorb`); back(); }
    } catch (e) { korb.disabled = false; fehlerToast("Hat nicht geklappt", e); }
  };
  // wrap: Bei 320 px Breite stehen die zwei Knöpfe untereinander statt zweizeilig beschriftet (seit 0.21)
  const aktionen = el("div", { class: "actions wrap" }, t.geloescht ? null : aendern, korb);
  // „Für Vinted“ (seit 0.22): Titel und Beschreibung zum Kopieren, Foto zum Sichern. Bei verkauften Teilen nicht mehr nötig.
  // Beim Verkaufen (seit 0.26, iPhone-Test 18.11.2026): „Für Vinted“ und „Verkaufen“ stehen oben, Angaben, Ordner und 🚫 sind
  // eingeklappt (die braucht es dann kaum noch), „Was passt dazu?“ fällt weg.
  const verkauft = istVerkauft(t), beimVerkauf = !t.geloescht && (verkauft || imVerkauf(t));
  const passt = t.geloescht || verkauft ? null : el("div", { class: "actions wrap" },
    beimVerkauf ? null : el("button", { type: "button", class: "btn primary", onclick: () => go({ v: "passt", nr }) }, "✨ Was passt dazu?"),
    el("button", { type: "button", class: beimVerkauf ? "btn primary" : "btn", onclick: () => go({ v: "vinted", nr }) }, "🏷 Für Vinted"));
  // Verkaufen (seit 0.26): 💰 will ich verkaufen → 📦 bei Vinted eingestellt → ✅ verkauft. Speichert sofort.
  const verkaufBox = t.geloescht ? el("div", {}) : verkaufFeld(t, () => neuZeichnen());
  const auswahlPanel = t.geloescht || verkauft ? null : el("div", { class: "panel" }, ordnerFeld, nichtFeld, beimVerkauf ? null : verkaufBox);
  const klappe = beimVerkauf ? el("details", { class: "klappe" }, el("summary", {}, el("span", {}, "Angaben ansehen")), inhalt, auswahlPanel) : null;
  if (klappe) { klappe.open = angabenOffen; klappe.ontoggle = () => { angabenOffen = klappe.open; }; }
  fill($("ansicht"),
    kopf(`Nr. ${nrText(nr)} – ${beschreibung(t)}`, t.geloescht ? `Liegt im Papierkorb (${nochTage(t)})` : verkauft ? "✅ Verkauft – nicht mehr im Kleiderschrank" : null),
    bild, passt, beimVerkauf ? el("div", { class: "panel" }, verkaufBox) : null,
    klappe || inhalt, klappe ? null : auswahlPanel, aktionen);
}

/* ---------- Papierkorb ---------- */
function renderKorb(items, naechste) {
  const weg = items.filter(t => t.geloescht).sort((a, b) => b.geloescht.localeCompare(a.geloescht));
  const leeren = el("button", { type: "button", class: "btn" }, "Papierkorb leeren");
  leeren.onclick = async () => {
    if (!confirm(`${anzahl(weg.length)} endgültig löschen?\n\nDas kann man nicht rückgängig machen. Die Nummern werden nicht neu vergeben.`)) return;
    try { await purgeItems(weg.map(t => t.nr)); toast("Papierkorb geleert"); neuZeichnen(); } catch (e) { fehlerToast("Hat nicht geklappt", e); }
  };
  // „Auswählen“: mehrere auf einmal wiederherstellen oder endgültig löschen
  const waehlenKnopf = weg.length ? el("button", { type: "button", class: "kopf-knopf" }, mehrfach ? "Fertig" : "Auswählen") : null;
  if (waehlenKnopf) waehlenKnopf.onclick = () => { mehrfach = mehrfach ? null : new Set(); neuZeichnen(); };
  let leiste = null;
  const kacheln = weg.map(t => {
    const rest = el("span", { class: "rest" }, nochTage(t));
    if (mehrfach) {
      const k = teilKachel(t, { markiert: mehrfach.has(t.nr), extra: rest,
        onclick: () => { mehrfach.has(t.nr) ? mehrfach.delete(t.nr) : mehrfach.add(t.nr); haken(k, mehrfach.has(t.nr)); leiste.update(); } });
      k.dataset.nr = t.nr; return k;
    }
    const zurueck = el("button", { type: "button", class: "btn klein" }, "Wiederherstellen");
    zurueck.onclick = async ev => {
      ev.stopPropagation(); zurueck.disabled = true;
      try { await restoreItem(t.nr); toast(`Nr. ${nrText(t.nr)} ist wieder da`); neuZeichnen(); } catch (e) { zurueck.disabled = false; fehlerToast("Hat nicht geklappt", e); }
    };
    return el("div", { class: "korb-teil" }, teilKachel(t, { onclick: () => go({ v: "teil", nr: t.nr }), extra: rest }), zurueck);
  });
  if (mehrfach) leiste = auswahlLeiste(() => kacheln, [
    { text: "Wiederherstellen", los: async nrs => {
      await updateItems(nrs.map(nr => ({ nr, geloescht: null })));
      fertigMit(`${anzahl(nrs.length)} wiederhergestellt`);
    } },
    { text: "Endgültig löschen", los: async nrs => {
      if (!confirm(`${anzahl(nrs.length)} endgültig löschen?\n\nDas kann man nicht rückgängig machen. Die Nummern werden nicht neu vergeben.`)) return;
      await purgeItems(nrs);
      fertigMit(`${anzahl(nrs.length)} endgültig gelöscht`);
    } }]);
  fill($("ansicht"),
    kopf("Papierkorb", `Gelöschte Teile bleiben ${KORB_TAGE} Tage hier und behalten ihre Nummer. Danach werden sie endgültig gelöscht.`, waehlenKnopf),
    el("div", { class: "grid" }, ...kacheln),
    mehrfach ? leiste.el : weg.length ? el("div", { class: "actions" }, leeren) : el("p", { class: "hint" }, "Der Papierkorb ist leer."),
    mehrfach ? null : nummernKarte(items, naechste));
}

/* ---------- Start ---------- */
// Teile, die länger als 30 Tage im Papierkorb liegen, endgültig löschen. Gibt zurück, ob etwas gelöscht wurde.
async function aufraeumen() {
  const alt = (await allItems()).filter(t => t.geloescht && Date.now() - Date.parse(t.geloescht) >= KORB_TAGE * TAG);
  await purgeItems(alt.map(t => t.nr));
  return alt.length > 0;
}
// Start seit 0.25 schneller (Durchsicht 11.11.2026): Die Wörter von vor 0.6.3 werden nur einmal angeglichen (danach steht es in
// meta, Sicherungen gleicht schon das Laden an), und der Kleiderschrank wird nur einmal gelesen statt dreimal.
export async function initSchrank() {
  try {
    if (!(await getMeta("woerterAngeglichen"))) { await updateAll(teilAngleichen); await setMeta("woerterAngeglichen", true); }
  } catch (e) { console.error(e); }
  try { await aufraeumen(); } catch (e) { console.error(e); }
  schwebeEinrichten();
  const wieder = await sitzungLaden().catch(e => { console.error(e); return null; });
  sitzungEinrichten();
  const neuGestartet = !history.state?.v;
  if (!neuGestartet) current = history.state; else history.replaceState(current, "");
  await show(current.y || 0);
  // Neu gestartet (z. B. vom iPhone im Hintergrund geschlossen) und sie war gerade bei „Outfit finden“ / „Was passt dazu?“:
  // gleich wieder dorthin, „Zurück“ führt zur Startseite
  if (neuGestartet && wieder) go(wieder);
}

/* ---------- Merken über einen Neustart (seit 0.27, Wunsch 18.11.2026) ----------
   Das iPhone schließt die App oft im Hintergrund, z. B. beim Wechsel zu ChatGPT. Dann waren Anlass, Wetter und die eingefügte
   Antwort weg. Jetzt wird beim Verlassen der App gemerkt, was bei „Outfit finden“ und „Was passt dazu?“ steht (meta „sitzung“,
   nur auf dem Gerät, nicht in der Sicherung). Beim nächsten Start kommt es zurück, wenn es höchstens einen Tag alt ist; war
   sie gerade in einer der beiden Ansichten (höchstens 2 Stunden her), öffnet sich diese wieder. */
const SITZUNG_STUNDEN = 24, WIEDER_STUNDEN = 2, STUNDE = 3600 * 1000;
function sitzungMerken() {
  const ansicht = current.v === "outfit" ? { v: "outfit" } : current.v === "passt" ? { v: "passt", nr: current.nr } : null;
  setMeta("sitzung", { zeit: new Date().toISOString(), ansicht, outfit: outfitStand(), passt: passtStand(), chat: chatMerkStand() })
    .catch(e => console.error("Merken ging nicht", e));
}
function sitzungEinrichten() {
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") sitzungMerken(); });
  addEventListener("pagehide", sitzungMerken);
}
// Gibt die Ansicht zurück, die wieder geöffnet werden soll (oder null)
async function sitzungLaden() {
  const s = await getMeta("sitzung");
  const alter = s && typeof s.zeit === "string" ? Date.now() - Date.parse(s.zeit) : Infinity;
  if (!(alter >= 0 && alter < SITZUNG_STUNDEN * STUNDE)) return null;
  outfitLaden(s.outfit); passtLaden(s.passt); chatMerkLaden(s.chat);
  if (alter >= WIEDER_STUNDEN * STUNDE || !s.ansicht) return null;
  if (s.ansicht.v === "outfit") return { v: "outfit" };
  if (s.ansicht.v === "passt" && Number.isInteger(s.ansicht.nr) && s.ansicht.nr > 0) return { v: "passt", nr: s.ansicht.nr };
  return null;
}
// Knopf „↺ Neu anfangen“ oben rechts bei „Outfit finden“ und „Was passt dazu?“ (Wunsch 18.11.2026: bisher musste man die App
// schließen). hatEtwas() = ist etwas angetippt oder eingefügt?, leeren() = alles zurücksetzen. Rückfrage nur, wenn eine Antwort da ist.
function neuKnopf(hatEtwas, mitAntwort, leeren) {
  const b = el("button", { type: "button", class: "kopf-knopf" }, "↺ Neu anfangen");
  b.onclick = () => {
    if (!hatEtwas()) return toast("Es ist noch nichts ausgewählt.");
    if (mitAntwort() && !confirm("Neu anfangen?\n\nDie Auswahl oben und die eingefügte Antwort aus dem Chat werden geleert. Gespeicherte Outfits bleiben.")) return;
    leeren(); sitzungMerken(); toast("Alles zurückgesetzt");
    neuZeichnen().then(() => scrollen(0));
  };
  return b;
}
