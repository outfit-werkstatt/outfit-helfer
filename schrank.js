// Etappe 1b: Kleiderschrank ansehen und ordnen.
// Startseite mit Ordnern („Mein Kleiderschrank“ = immer alle Teile, dazu eigene Ordner wie Alben in der Fotos-App,
// ein Teil kann in mehreren sein), Ordner-Ansicht mit Filtern, Teil-Ansicht (ändern, Ordner, Papierkorb), Papierkorb.
// Jede Ansicht bekommt einen Eintrag im Verlauf, damit „Zurück“ (Knopf, Wischen, Android-Taste) funktioniert.
import { $, el, fill, toast, swatch, clean, beschreibung, choice, field, angabenFelder, angabenVon, customReady, zeigeGross, teilAngleichen } from "./ui.js?v=5";
import { allItems, getItem, getPhoto, updateItem, updateAll, trashItem, restoreItem, purgeItems, getFolders, setFolders, deleteFolder, setFolderItems, getStil, nrText } from "./speicher.js?v=5";
import { renderStil, stilKurz } from "./stil.js?v=4";
import { GROUPS } from "./ki.js?v=3";

// Feste Ordner: „Mein Kleiderschrank“ (alle) und „Ziehe ich nicht an“ (füllt sich von selbst, erscheint nur, wenn es solche Teile gibt)
const ALLE = "alle", HAUPT = "Mein Kleiderschrank", NICHT = "nicht", NICHT_NAME = "🚫 Ziehe ich nicht an", TAG = 24 * 3600 * 1000, KORB_TAGE = 30;
const GROUP_ORDER = GROUPS.map(([g]) => g);
const sichtbar = items => items.filter(t => !t.geloescht);
const restTage = t => Math.max(0, KORB_TAGE - Math.floor((Date.now() - Date.parse(t.geloescht)) / TAG));
// „noch 3 Tage“, „noch 1 Tag“, „noch heute“
const nochTage = t => { const n = restTage(t); return n <= 0 ? "noch heute" : n === 1 ? "noch 1 Tag" : `noch ${n} Tage`; };
// Ordner angelegt, umbenannt oder gelöscht → offene Prüfen-Karten (app.js) zeigen die neue Liste
const ordnerMelden = () => document.dispatchEvent(new Event("ordner-geaendert"));

/* ---------- Ansichten und „Zurück“ ---------- */
let current = { v: "start", d: 0 }, urls = [];
let bearbeitet = false; // „Angaben ändern“ ist offen: dann nicht von außen neu zeichnen, sonst wären die Änderungen weg
const url = blob => { const u = URL.createObjectURL(blob); urls.push(u); return u; };
export function go(state) {
  history.replaceState({ ...current, y: scrollY }, "");
  current = { ...state, d: current.d + 1 };
  history.pushState(current, "");
  show(0);
}
function back() {
  if (current.d > 0) history.back();
  else { current = { v: "start", d: 0 }; history.replaceState(current, ""); show(0); }
}
addEventListener("popstate", e => { current = e.state || { v: "start", d: 0 }; show(current.y || 0); });
history.scrollRestoration = "manual"; // die Stelle merken wir uns selbst (y im Verlauf)
async function show(y) {
  auswahl = null; bearbeitet = false; // „Teile auswählen“ und „Angaben ändern“ enden, sobald man die Ansicht wechselt
  $("ansichtStart").hidden = current.v !== "start"; $("ansicht").hidden = current.v === "start";
  try { await render(); } catch (e) { toast("Anzeigen hat nicht geklappt: " + (e?.message || e)); console.error(e); }
  scrollTo(0, y);
}
// Dieselbe Ansicht neu zeichnen, ohne zu springen
async function neuZeichnen() { const y = scrollY; await render(); scrollTo(0, y); }
// Von außen (z. B. nach dem Speichern neuer Teile): nur neu zeichnen, wenn dabei nichts Eingetipptes verloren geht
export async function refresh() { if (current.v !== "stil" && !bearbeitet) await neuZeichnen(); }
// Jede Zeichnung bekommt eine Nummer. Wird eine ältere erst nach einer neueren fertig (sehr schnelles Tippen),
// zeichnet sie nicht mehr – sonst stünde die falsche Ansicht da.
let zeichnung = 0;
async function render() {
  const nr = ++zeichnung, s = current;
  await customReady;
  const [items, folders, stil, foto] = await Promise.all([
    s.v === "teil" ? getItem(s.nr).then(t => t ? [t] : []) : allItems(),
    getFolders(), getStil(), s.v === "teil" ? getPhoto(s.nr) : null]);
  if (nr !== zeichnung) return;
  urls.forEach(u => URL.revokeObjectURL(u)); urls = [];
  // Auswahl-Felder der vorigen Ansicht abmelden (sie hören sonst weiter auf neue eigene Einträge)
  const box = $("ansicht"); box.dispose?.(); box.dispose = null;
  if (s.v === "liste") return renderListe(items, folders, s.id);
  if (s.v === "teil") return renderTeil(items, folders, s.nr, foto);
  if (s.v === "korb") return renderKorb(items);
  if (s.v === "stil") return renderStil(box, kopf("Mein Stil"), stil);
  renderStart(items, folders, stil);
}
const kopf = (titel, unter) => el("div", { class: "kopf" },
  el("button", { type: "button", class: "zurueck", onclick: back }, "‹ Zurück"),
  el("h2", {}, titel), unter ? el("div", { class: "hint" }, unter) : null);
const anzahl = n => `${n} ${n === 1 ? "Teil" : "Teile"}`;

/* ---------- Startseite: Ordner-Kacheln ---------- */
function kachel(name, list, onclick) {
  const bilder = list.slice(0, 4).map(t => el("img", { src: url(t.vorschau), alt: "", loading: "lazy" }));
  return el("button", { type: "button", class: "kachel", onclick },
    el("span", { class: bilder.length === 1 ? "mosaik eins" : "mosaik" }, ...bilder),
    el("span", { class: "name" }, name), el("span", { class: "anzahl" }, anzahl(list.length)));
}
function renderStart(items, folders, stil) {
  const da = sichtbar(items).sort((a, b) => b.nr - a.nr), korb = items.length - da.length;
  // „Mein Stil“: Kurzfassung (höchstens 3 Angaben, alles Weitere steht in „Mein Stil“) oder Bitte, es einmal einzustellen
  const kurz = stilKurz(stil);
  const zeigen = kurz.length > 3 ? [...kurz.slice(0, 3), `und ${kurz.length - 3} weitere`] : kurz;
  const stilKnopf = el("button", { type: "button", class: "btn" }, kurz.length ? "Ändern" : "Jetzt einstellen");
  stilKnopf.onclick = () => go({ v: "stil" });
  fill($("stilKarte"), el("div", { class: "panel stil-karte" },
    el("div", { class: "titel" }, "✨ Mein Stil"),
    el("div", { class: "hint" }, zeigen.length ? zeigen.join(" · ") : "Noch nicht eingestellt. Sag einmal, was du gern trägst und was lieber nicht – die Vorschläge halten sich daran."),
    el("div", { class: "actions" }, stilKnopf)));
  const neu = el("button", { type: "button", class: "kachel neu" }, el("span", { class: "plus" }, "+"), el("span", { class: "name" }, "Neuer Ordner"));
  neu.onclick = () => nameEditor($("ordnerEditor"), "", folders, async name => {
    const f = { id: "o" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name };
    await setFolders([...folders, f]); ordnerMelden();
    toast(`Ordner „${name}“ angelegt`);
    go({ v: "liste", id: f.id });
  });
  const nicht = da.filter(t => t.nichtAnziehen);
  fill($("kacheln"),
    kachel(HAUPT, da, () => go({ v: "liste", id: ALLE })),
    ...folders.map(f => kachel(f.name, da.filter(t => t.ordner?.includes(f.id)), () => go({ v: "liste", id: f.id }))),
    nicht.length ? kachel(NICHT_NAME, nicht, () => go({ v: "liste", id: NICHT })) : null,
    neu);
  $("ordnerEditor").replaceChildren(); $("ordnerEditor").hidden = true;
  fill($("korbLink"), el("span", { "aria-hidden": "true" }, "🗑"), el("span", { class: "u" }, korb ? `Papierkorb (${anzahl(korb)})` : "Papierkorb (leer)"));
  $("korbLink").onclick = () => go({ v: "korb" });
}
// Name für neuen oder umbenannten Ordner eingeben (max. 30 Zeichen, nicht doppelt)
function nameEditor(box, start, folders, onOk, selfId = null) {
  const input = el("input", { type: "text", maxLength: 30, value: start, placeholder: "z. B. Sommer, Arbeit, Zum Verkaufen", "aria-label": "Name des Ordners", autocomplete: "off" });
  const msg = el("div", { class: "note" }), ok = el("button", { type: "button", class: "btn primary" }, start ? "Speichern" : "Anlegen");
  const close = () => { box.hidden = true; box.replaceChildren(); };
  ok.onclick = async () => {
    const name = clean(input.value), lower = name.toLowerCase();
    if (!name) { msg.textContent = "Bitte einen Namen eintippen."; return; }
    if ([HAUPT, "Papierkorb", "Ziehe ich nicht an", NICHT_NAME].some(n => n.toLowerCase() === lower) || folders.some(f => f.id !== selfId && f.name.toLowerCase() === lower)) {
      msg.textContent = "Diesen Namen gibt es schon."; return;
    }
    ok.disabled = true;
    try { await onOk(name); } catch (e) { msg.textContent = "Hat nicht geklappt: " + (e?.message || e); ok.disabled = false; }
  };
  input.onkeydown = e => { if (e.key === "Enter") ok.click(); };
  box.replaceChildren(el("div", { class: "eigen-edit" }, input, msg,
    el("div", { class: "actions" }, el("button", { type: "button", class: "btn", onclick: close }, "Abbrechen"), ok)));
  box.hidden = false; input.focus();
}

/* ---------- Ordner-Ansicht mit Filtern und Suche ---------- */
const filters = new Map(); // pro Ordner gemerkt, solange die App offen ist: { gruppe, farbe, suche }
let auswahl = null;        // „Teile auswählen“: Set der Nummern, die im Ordner sein sollen (sonst null)
function teilKachel(t, { markiert = null, onclick, extra = null }) {
  const b = el("button", { type: "button", class: "teil" + (markiert ? " markiert" : "") },
    el("span", { class: "bild" }, el("img", { src: url(t.vorschau), alt: beschreibung(t), loading: "lazy" }),
      el("span", { class: "plakette" }, nrText(t.nr)), markiert !== null ? el("span", { class: "haken" }, markiert ? "✓" : "") : null,
      t.nichtAnziehen ? el("span", { class: "nicht", title: "Ziehe ich nicht an" }, "🚫") : null),
    el("span", { class: "text" }, `Nr. ${nrText(t.nr)} – ${beschreibung(t)}`), extra);
  b.onclick = onclick;
  if (markiert !== null) b.setAttribute("aria-pressed", markiert);
  return b;
}
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
function passtSuche(t, q) {
  q = q.trim().toLowerCase().replace(/^nr\.?\s*/, "");
  if (!q) return true;
  if (/^\d+$/.test(q)) return t.nr === Number(q) || nrText(t.nr).startsWith(q);
  const text = [t.art, t.gruppe, ...(t.farben || []), t.muster, t.material, t.aermel, t.schnitt, t.weite, t.laenge, t.bund,
    ...(t.stil || []), ...(t.saison || []), t.notiz].filter(Boolean).join(" ").toLowerCase();
  return q.split(/\s+/).every(w => text.includes(w));
}
function renderListe(items, folders, id) {
  const ordner = id === ALLE ? null : folders.find(f => f.id === id);
  if (id !== ALLE && id !== NICHT && !ordner) { auswahl = null; return back(); }
  const da = sichtbar(items).sort((a, b) => b.nr - a.nr);
  const drin = ordner ? da.filter(t => t.ordner?.includes(id)) : id === NICHT ? da.filter(t => t.nichtAnziehen) : da;
  const f = filters.get(id) || { gruppe: null, farbe: null, suche: "" };
  filters.set(id, f);
  const basis = auswahl ? da : drin; // beim Auswählen alle Teile zeigen
  const gefiltert = basis.filter(t => (!f.gruppe || (t.gruppe || "Sonstiges") === f.gruppe) && (!f.farbe || t.farben?.includes(f.farbe)));
  const editor = el("div", {}); editor.hidden = true;

  let aktionen = null;
  if (ordner && auswahl) {
    const fertig = el("button", { type: "button", class: "btn primary" }, `Fertig (${anzahl(auswahl.size)})`);
    fertig.onclick = async () => {
      fertig.disabled = true;
      try { await setFolderItems(id, auswahl); auswahl = null; toast("Ordner gespeichert"); neuZeichnen(); }
      catch (e) { fertig.disabled = false; toast("Speichern hat nicht geklappt: " + (e?.message || e)); }
    };
    aktionen = el("div", {}, el("div", { class: "hint" }, `Tippe die Teile an, die in „${ordner.name}“ sein sollen. In „${HAUPT}“ bleiben sie immer.`),
      el("div", { class: "actions" }, el("button", { type: "button", class: "btn", onclick: () => { auswahl = null; neuZeichnen(); } }, "Abbrechen"), fertig));
  } else if (ordner) {
    const waehlen = el("button", { type: "button", class: "btn primary", onclick: () => { auswahl = new Set(drin.map(t => t.nr)); neuZeichnen(); } }, "Teile auswählen");
    const umbenennen = el("button", { type: "button", class: "btn" }, "Umbenennen");
    umbenennen.onclick = () => nameEditor(editor, ordner.name, folders, async name => {
      await setFolders(folders.map(x => x.id === id ? { ...x, name } : x)); ordnerMelden(); toast("Umbenannt"); neuZeichnen();
    }, id);
    const loeschen = el("button", { type: "button", class: "btn" }, "Ordner löschen");
    loeschen.onclick = async () => {
      const teile = drin.length === 1 ? "Das 1 Teil darin wird NICHT gelöscht, es bleibt" : `Die ${anzahl(drin.length)} darin werden NICHT gelöscht, sie bleiben`;
      if (!confirm(`Ordner „${ordner.name}“ löschen?\n\n${teile} in „${HAUPT}“.`)) return;
      try { await deleteFolder(id); ordnerMelden(); toast("Ordner gelöscht"); back(); } catch (e) { toast("Löschen hat nicht geklappt: " + (e?.message || e)); }
    };
    aktionen = el("div", { class: "actions wrap" }, waehlen, umbenennen, loeschen);
  }
  const leer = basis.length ? (gefiltert.length ? null : "Mit diesem Filter gibt es hier nichts.")
    : ordner ? "Noch keine Teile in diesem Ordner. Tippe auf „Teile auswählen“."
    : id === NICHT ? "Keine Teile mehr markiert." : "Noch nichts gespeichert. Füge auf der Startseite Kleidung hinzu.";
  const unter = auswahl ? null : ordner ? anzahl(drin.length)
    : id === NICHT ? `${anzahl(drin.length)}, ${drin.length === 1 ? "das nie in Outfit-Vorschläge kommt" : "die nie in Outfit-Vorschläge kommen"}. Zum Zurückholen: Teil antippen und „Ziehe ich nicht an“ ausschalten.`
    : `Alle ${anzahl(drin.length)}`;

  const teilVon = new Map(gefiltert.map(t => [t.nr, t]));
  const grid = el("div", { class: "grid" }, ...gefiltert.map(t => {
    const k = auswahl
      ? teilKachel(t, { markiert: auswahl.has(t.nr), onclick: () => { auswahl.has(t.nr) ? auswahl.delete(t.nr) : auswahl.add(t.nr); neuZeichnen(); } })
      : teilKachel(t, { onclick: () => go({ v: "teil", nr: t.nr }) });
    k.dataset.nr = t.nr; return k;
  }));
  // Beim Tippen in die Suche nur Kacheln ein- und ausblenden (neu zeichnen würde die Tastatur schließen)
  const suche = el("input", { type: "search", class: "suche", value: f.suche, placeholder: "Suchen: Nr. oder Wort, z. B. 012 oder Jeans", "aria-label": "Suchen", autocomplete: "off", enterKeyHint: "search" });
  const keinTreffer = el("p", { class: "hint" }, "Nichts gefunden.");
  const suchen = () => {
    f.suche = suche.value;
    let n = 0;
    for (const k of grid.children) { const ok = passtSuche(teilVon.get(Number(k.dataset.nr)), f.suche); k.hidden = !ok; if (ok) n++; }
    keinTreffer.hidden = n > 0 || !gefiltert.length;
  };
  suche.oninput = suchen;
  suche.onkeydown = e => { if (e.key === "Enter") suche.blur(); };
  suchen();
  fill($("ansicht"),
    kopf(ordner ? ordner.name : id === NICHT ? NICHT_NAME : HAUPT, unter),
    aktionen, editor,
    basis.length ? suche : null,
    basis.length ? filterChips(basis, f, nf => { filters.set(id, nf); neuZeichnen(); }) : null,
    grid, keinTreffer,
    leer ? el("p", { class: "hint" }, leer) : null);
}

/* ---------- Teil-Ansicht ---------- */
const datum = iso => new Date(iso).toLocaleDateString("de-DE");
function renderTeil(items, folders, nr, foto) {
  const t = items.find(x => x.nr === nr);
  if (!t) return back();
  const bild = el("img", { class: "gross", src: url(foto || t.vorschau), alt: beschreibung(t) });
  bild.onclick = () => zeigeGross(bild.src, beschreibung(t));
  const zeile = (k, v) => v ? [el("dt", {}, k), el("dd", {}, v)] : [];
  const angaben = el("dl", { class: "angaben" },
    ...zeile("Art", t.gruppe ? `${t.gruppe} › ${t.art}` : t.art), ...zeile("Farbe", (t.farben || []).join(" / ")),
    ...zeile("Muster", t.muster), ...zeile("Material", t.material || "noch nicht gewählt"),
    ...zeile("Ärmel", t.aermel), ...zeile("Hosenschnitt", t.schnitt),
    ...zeile("Weite", t.weite), ...zeile("Länge", t.laenge), ...zeile("Bund", t.bund),
    ...zeile("Stil", t.stil?.join(", ")), ...zeile("Saison", t.saison?.join(", ")), ...zeile("Notiz", t.notiz),
    ...zeile("Vorschläge", t.nichtAnziehen ? "🚫 Ziehe ich nicht an" : null), ...zeile("Hinzugefügt", datum(t.erstellt)));
  const inhalt = el("div", { class: "panel" }, angaben);

  // Ordner: Änderungen werden sofort gespeichert
  const ordnerFeld = folders.length
    ? field("Ordner", `Immer in „${HAUPT}“. Zusätzlich in:`, choice({
        options: folders.map(f => f.name), selected: folders.filter(f => t.ordner?.includes(f.id)).map(f => f.name), max: 0,
        onChange: async sel => {
          try { await updateItem(nr, { ordner: folders.filter(f => sel.includes(f.name)).map(f => f.id) }); toast("Gespeichert"); }
          catch (e) { toast("Speichern hat nicht geklappt: " + (e?.message || e)); refresh(); }
        } }).el)
    : field("Ordner", `Liegt in „${HAUPT}“. Eigene Ordner (z. B. „Sommer“) legst du auf der Startseite mit „+ Neuer Ordner“ an.`, null);
  // „Ziehe ich nicht an“ mit einem Tippen an/aus, ohne „Angaben ändern“
  const nichtFeld = field("Vorschläge", "Teil bleibt im Kleiderschrank, kommt aber nie in Outfit-Vorschläge.", choice({
    options: [NICHT_NAME], selected: t.nichtAnziehen ? [NICHT_NAME] : [],
    onChange: async sel => {
      try { await updateItem(nr, { nichtAnziehen: sel.length > 0 }); toast(sel.length ? "Kommt nicht mehr in Vorschläge" : "Kommt wieder in Vorschläge"); }
      catch (e) { toast("Speichern hat nicht geklappt: " + (e?.message || e)); }
      neuZeichnen();
    } }).el);

  const aendern = el("button", { type: "button", class: "btn" }, "Angaben ändern");
  aendern.onclick = () => {
    bearbeitet = true;
    const form = angabenFelder(angabenVon(t), () => { speichern.disabled = !form.get().art; });
    $("ansicht").dispose = () => form.dispose();
    const fertig = () => { bearbeitet = false; neuZeichnen(); };
    const speichern = el("button", { type: "button", class: "btn primary" }, "Speichern");
    const abbrechen = el("button", { type: "button", class: "btn", onclick: fertig }, "Abbrechen");
    speichern.onclick = async () => {
      speichern.disabled = true;
      try { await updateItem(nr, form.get()); toast("Gespeichert"); fertig(); }
      catch (e) { speichern.disabled = false; toast("Speichern hat nicht geklappt: " + (e?.message || e)); }
    };
    inhalt.replaceChildren(...form.elements, el("div", { class: "actions" }, abbrechen, speichern));
    // 🚫 steht jetzt im Formular unter „Mehr Angaben“; ein zweiter Schalter würde das Formular verwerfen
    aktionen.hidden = true; nichtFeld.hidden = true;
  };
  const korb = el("button", { type: "button", class: "btn" }, t.geloescht ? "Wiederherstellen" : "In den Papierkorb");
  korb.onclick = async () => {
    try {
      if (t.geloescht) { await restoreItem(nr); toast(`Nr. ${nrText(nr)} ist wieder da`); neuZeichnen(); }
      else { await trashItem(nr); toast(`Nr. ${nrText(nr)} liegt jetzt im Papierkorb`); back(); }
    } catch (e) { toast("Hat nicht geklappt: " + (e?.message || e)); }
  };
  const aktionen = el("div", { class: "actions" }, t.geloescht ? null : aendern, korb);
  fill($("ansicht"),
    kopf(`Nr. ${nrText(nr)} – ${beschreibung(t)}`, t.geloescht ? `Liegt im Papierkorb (${nochTage(t)})` : null),
    bild, inhalt, t.geloescht ? null : el("div", { class: "panel" }, ordnerFeld, nichtFeld), aktionen);
}

/* ---------- Papierkorb ---------- */
function renderKorb(items) {
  const weg = items.filter(t => t.geloescht).sort((a, b) => b.geloescht.localeCompare(a.geloescht));
  const leeren = el("button", { type: "button", class: "btn" }, "Papierkorb leeren");
  leeren.onclick = async () => {
    if (!confirm(`${anzahl(weg.length)} endgültig löschen?\n\nDas kann man nicht rückgängig machen. Die Nummern werden nicht neu vergeben.`)) return;
    try { await purgeItems(weg.map(t => t.nr)); toast("Papierkorb geleert"); neuZeichnen(); } catch (e) { toast("Hat nicht geklappt: " + (e?.message || e)); }
  };
  fill($("ansicht"),
    kopf("Papierkorb", `Gelöschte Teile bleiben ${KORB_TAGE} Tage hier und behalten ihre Nummer. Danach werden sie endgültig gelöscht.`),
    el("div", { class: "grid" }, ...weg.map(t => {
      const zurueck = el("button", { type: "button", class: "btn klein" }, "Wiederherstellen");
      zurueck.onclick = async ev => {
        ev.stopPropagation();
        try { await restoreItem(t.nr); toast(`Nr. ${nrText(t.nr)} ist wieder da`); neuZeichnen(); } catch (e) { toast("Hat nicht geklappt: " + (e?.message || e)); }
      };
      return el("div", { class: "korb-teil" },
        teilKachel(t, { onclick: () => go({ v: "teil", nr: t.nr }), extra: el("span", { class: "rest" }, nochTage(t)) }), zurueck);
    })),
    weg.length ? el("div", { class: "actions" }, leeren) : el("p", { class: "hint" }, "Der Papierkorb ist leer."));
}

/* ---------- Start ---------- */
// Teile, die länger als 30 Tage im Papierkorb liegen, endgültig löschen
async function aufraeumen() {
  const alt = (await allItems()).filter(t => t.geloescht && Date.now() - Date.parse(t.geloescht) >= KORB_TAGE * TAG);
  await purgeItems(alt.map(t => t.nr));
}
export async function initSchrank() {
  try { await updateAll(teilAngleichen); } catch (e) { console.error(e); } // Wörter von vor 0.6.3 angleichen
  try { await aufraeumen(); } catch (e) { console.error(e); }
  if (history.state?.v) current = history.state; else history.replaceState(current, "");
  await show(current.y || 0);
}
