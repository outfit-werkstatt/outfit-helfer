// Bausteine für die Bedienung, die mehrere Ansichten brauchen: Elemente bauen, Meldungen, Auswahl-Knöpfe, Angaben-Felder.
// Sicherheitsregel: Texte immer per textContent/DOM einsetzen, nie per innerHTML (gilt besonders für Eingetipptes).
// Alle Dateien müssen ki.js und speicher.js mit GLEICHEM ?v= laden, sonst lädt der Browser sie doppelt.
import { GROUPS, GROUP_OF, COLORS, MATERIALS, PATTERNS, SLEEVES, LEGS, HAS_SLEEVES, HAS_LEGS } from "./ki.js?v=4";
import { getCustom, setCustom } from "./speicher.js?v=7";

export const $ = id => document.getElementById(id);
// Farben: die der KI plus Silber und Roségold (für Schmuck; die KI kennt sie nicht und wählt sie nie vor)
export const FARBEN = [...COLORS.map(([n, , rgb]) => [n, rgb]), ["Silber", [196, 198, 204]], ["Roségold", [214, 158, 140]]];
export const FARB_NAMEN = FARBEN.map(([n]) => n);
const COLOR_RGB = new Map(FARBEN);
export function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) if (k === "class") e.className = v; else if (k in e) e[k] = v; else e.setAttribute(k, v);
  e.append(...kids.filter(k => k != null)); return e;
}
// Inhalt ersetzen; leere Teile (null) weglassen – replaceChildren würde sonst „null“ als Text anzeigen
export const fill = (node, ...kids) => node.replaceChildren(...kids.filter(k => k != null));
export function toast(text) {
  const t = $("toast"); t.textContent = text; t.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 2500);
}
// Foto bildschirmfüllend zeigen; Tippen irgendwo oder Esc schließt. onClose z. B. zum Freigeben der Bild-Adresse.
export function zeigeGross(url, alt = "", onClose = () => {}) {
  const box = el("div", { class: "gross-ansicht", role: "dialog", "aria-label": "Foto groß" },
    el("img", { src: url, alt }), el("button", { type: "button", class: "btn" }, "✕ Schließen"));
  const onKey = e => { if (e.key === "Escape") close(); };
  function close() { box.remove(); document.body.classList.remove("ohne-scroll"); document.removeEventListener("keydown", onKey); onClose(); }
  box.onclick = close;
  document.addEventListener("keydown", onKey);
  document.body.classList.add("ohne-scroll");
  document.body.append(box);
}
export const swatch = name => COLOR_RGB.has(name) ? el("span", { class: "sw", style: `background:rgb(${COLOR_RGB.get(name).join(",")})` }) : null;
export const clean = s => s.replace(/\s+/g, " ").trim();
// Wie clean, aber Zeilenumbrüche bleiben (höchstens eine Leerzeile) – für Notizen und „Sonst noch etwas?“
export const cleanText = s => s.split("\n").map(clean).join("\n").replace(/\n{3,}/g, "\n\n").trim();
export const names = list => list.map(([n]) => n);
// Testanzeige (5× auf die Versionsnummer tippen): zeigt Messwerte der Doppel-Prüfung. Nur für dieses Gerät gemerkt.
export const testAnzeige = () => { try { return localStorage.getItem("testAnzeige") === "1"; } catch { return false; } };
export const setTestAnzeige = an => { try { an ? localStorage.setItem("testAnzeige", "1") : localStorage.removeItem("testAnzeige"); } catch {} };
// Kurzbeschreibung eines Teils: „Bluse, braun / terrakotta“
export const beschreibung = t => `${t.art}${t.farben?.length ? ", " + t.farben.join(" / ").toLowerCase() : ""}`;

/* ---------- Eigene Einträge („Andere …“ → selbst eintippen) ----------
   Pro Merkmal eine Liste, dauerhaft auf dem Gerät gespeichert. Ein neuer eigener Eintrag erscheint sofort als Knopf
   in allen offenen Karten und beim nächsten Mal wieder. Löschen entfernt nur den Knopf; Teile, die den Wert
   schon haben, behalten ihn. Bei eigenen Arten wird gefragt, wozu sie gehören (für spätere Outfit-Regeln). */
let custom = {};
// Seit 0.6.3 teilen sich „Mein Stil“ und die Teil-Merkmale diese Listen (gleiche Wörter) → alte eigene Einträge umziehen
const LISTEN_UMZUG = { "Stil: Welcher Stil passt zu dir?": "Stil", "Stil: Oberteile": "Weite", "Stil: Bund": "Bund",
  "Stil: Rock- und Kleidlänge": "Länge Rock/Kleid", "Stil: Muster": "Muster" };
async function ladeEigene() {
  const c = await getCustom(); custom = c;
  const alt = Object.keys(LISTEN_UMZUG).filter(k => c[k]);
  if (!alt.length) return;
  const next = { ...c };
  for (const k of alt) {
    const ziel = LISTEN_UMZUG[k], da = new Set((next[ziel] || []).map(x => x.wert.toLowerCase()));
    next[ziel] = [...(next[ziel] || []), ...next[k].filter(x => !da.has(x.wert.toLowerCase()))];
    delete next[k];
  }
  custom = next; await setCustom(next);
}
export const customReady = ladeEigene().catch(e => console.error(e));
const customValues = f => (custom[f] || []).map(c => c.wert);
export const groupOf = a => GROUP_OF.get(a) ?? (custom.Art || []).find(c => c.wert === a)?.gruppe ?? null;
const widgets = new Set(); // offene Auswahl-Felder mit eigenen Einträgen
// Änderungen nacheinander ausführen, damit sich zwei Karten nicht gegenseitig überschreiben
let kette = Promise.resolve();
const nacheinander = fn => (kette = kette.then(fn, fn));
const addCustom = (f, wert, gruppe) => nacheinander(async () => {
  if (!customValues(f).some(v => v.toLowerCase() === wert.toLowerCase())) {
    const next = { ...custom, [f]: [...(custom[f] || []), gruppe ? { wert, gruppe } : { wert }] };
    await setCustom(next); custom = next;
  }
  for (const w of widgets) if (w.field === f) w.addOption(wert);
});
const removeCustom = (f, wert) => nacheinander(async () => {
  const next = { ...custom, [f]: (custom[f] || []).filter(c => c.wert !== wert) };
  await setCustom(next); custom = next;
  for (const w of widgets) if (w.field === f) w.removeOption(wert);
});
const EXAMPLE = { Art: "z. B. Kimono", Farbe: "z. B. Petrol", Muster: "z. B. Paisley", Material: "z. B. Viskose",
  Weite: "z. B. tailliert", "Länge oben": "z. B. hüftlang", "Länge Rock/Kleid": "z. B. bodenlang", Bund: "z. B. mit Gummizug", Stil: "z. B. Y2K" };

/* ---------- Auswahl-Knöpfe ----------
   options: sichtbare Knöpfe (in dieser Reihenfolge), more: weitere Werte im Auswahlfeld „Andere …“ ([Gruppe, [Werte]] oder [Werte]),
   selected: vorgewählte Werte, max: wie viele gleichzeitig (1 = nur einer, 0 = beliebig viele), onChange: wird nach jeder Änderung gerufen,
   field: Name des Merkmals, wenn man eigene Einträge eintippen darf, groupDefault: Vorschlag „Gehört zu“ bei eigener Art,
   beispiel: Platzhalter beim Eintippen, allein: Werte, die nur allein gewählt sein können (z. B. „ganzjährig“) */
export function choice({ field = null, options, more = [], selected = [], max = 1, withSwatch = false, onChange = () => {}, groupDefault = null, beispiel = null, allein = [] }) {
  const sel = new Set(selected), wrap = el("div", { class: "chips" }), buttons = new Map();
  const editor = el("div", { class: "eigen-edit" }); editor.hidden = true;
  let picker = null; // Auswahlfeld „Andere …“
  const render = () => { for (const [v, b] of buttons) b.setAttribute("aria-pressed", sel.has(v)); };
  function toggle(value) {
    if (sel.has(value)) sel.delete(value);
    else {
      if (max === 1 || allein.includes(value)) sel.clear();
      else { allein.forEach(a => sel.delete(a)); if (max && sel.size >= max) sel.delete([...sel][0]); }
      sel.add(value);
    }
    render(); onChange([...sel]);
  }
  function addButton(value, eigen = false) {
    if (buttons.has(value)) return;
    const b = el("button", { type: "button", class: eigen ? "chip eigen" : "chip" }, withSwatch ? swatch(value) : null, value);
    b.onclick = () => toggle(value);
    buttons.set(value, b); wrap.insertBefore(b, picker); render();
  }
  const close = () => { editor.hidden = true; editor.replaceChildren(); };
  const known = () => [...buttons.keys(), ...more.flatMap(m => Array.isArray(m) ? m[1] : [m])];
  function openNew() {
    const input = el("input", { type: "text", maxLength: 30, placeholder: beispiel || EXAMPLE[field] || "", "aria-label": "Eigener Eintrag", autocomplete: "off" });
    const grp = field === "Art" ? el("select", { "aria-label": "Gehört zu" }, ...GROUPS.map(([g]) => el("option", { value: g }, g))) : null;
    if (grp) grp.value = groupDefault?.() || GROUPS[0][0];
    const msg = el("div", { class: "note" });
    const ok = el("button", { type: "button", class: "btn primary" }, "Übernehmen");
    ok.onclick = async () => {
      const v = clean(input.value);
      if (!v) { msg.textContent = "Bitte etwas eintippen."; return; }
      // Gibt es das schon (auch anders geschrieben, z. B. klein)? Dann einfach das Vorhandene auswählen.
      const same = known().find(x => x.toLowerCase() === v.toLowerCase());
      if (same) { addButton(same, customValues(field).includes(same)); if (!sel.has(same)) toggle(same); close(); return; }
      ok.disabled = true;
      try { await addCustom(field, v, grp?.value); }
      catch (e) { msg.textContent = "Konnte nicht gespeichert werden: " + (e?.message || e); ok.disabled = false; return; }
      if (!sel.has(v)) toggle(v);
      close();
    };
    input.onkeydown = e => { if (e.key === "Enter") ok.click(); };
    editor.replaceChildren(
      el("div", { class: "note" }, "Wird als eigener Knopf gespeichert und ist beim nächsten Mal wieder da."),
      input, grp ? el("label", { class: "gehoert" }, "Gehört zu ", grp) : null, msg,
      el("div", { class: "actions" }, el("button", { type: "button", class: "btn", onclick: close }, "Abbrechen"), ok));
    editor.hidden = false; input.focus();
  }
  function openDelete() {
    const list = customValues(field);
    editor.replaceChildren(
      el("div", { class: "note" }, list.length ? "Eigene Einträge löschen. Teile, die den Eintrag schon haben, behalten ihn." : "Hier gibt es noch keine eigenen Einträge."),
      ...list.map(v => {
        const b = el("button", { type: "button", class: "btn" }, "Löschen"), row = el("div", { class: "eigen-row" }, el("span", {}, v), b);
        b.onclick = async () => {
          b.disabled = true;
          try { await removeCustom(field, v); row.remove(); } catch (e) { b.disabled = false; toast("Löschen hat nicht geklappt: " + (e?.message || e)); }
        };
        return row;
      }),
      el("div", { class: "actions" }, el("button", { type: "button", class: "btn", onclick: close }, "Fertig")));
    editor.hidden = false;
  }
  options.forEach(v => addButton(v));
  if (field) customValues(field).forEach(v => addButton(v, true));
  selected.forEach(v => addButton(v, customValues(field).includes(v))); // falls ein vorgewählter Wert nicht unter den Knöpfen ist
  if (more.length || field) {
    picker = el("select", { "aria-label": "Andere auswählen" }, el("option", { value: "" }, "Andere …"));
    if (field) picker.append(el("option", { value: "__neu" }, "✏️ Selbst eintippen …"));
    for (const m of more) {
      if (Array.isArray(m)) { const g = el("optgroup", { label: m[0] }); m[1].forEach(v => g.append(el("option", { value: v }, v))); picker.append(g); }
      else picker.append(el("option", { value: m }, m));
    }
    if (field) picker.append(el("option", { value: "__weg" }, "🗑 Eigene Einträge löschen …"));
    picker.onchange = () => {
      const v = picker.value; picker.value = "";
      if (v === "__neu") return openNew();
      if (v === "__weg") return openDelete();
      if (!v) return;
      addButton(v); if (!sel.has(v)) toggle(v);
    };
    wrap.append(picker);
  }
  render();
  const w = {
    field, el: el("div", {}, wrap, editor), get: () => [...sel],
    set: values => { sel.clear(); values.forEach(v => { addButton(v); sel.add(v); }); render(); }, // ohne onChange

    addOption: v => addButton(v, true),
    // Knopf nur entfernen, wenn er hier gerade nicht ausgewählt ist
    removeOption: v => { const b = buttons.get(v); if (b?.classList.contains("eigen") && !sel.has(v)) { b.remove(); buttons.delete(v); } },
    dispose: () => widgets.delete(w)
  };
  if (field) widgets.add(w);
  return w;
}
export const field = (label, note, body) => el("div", { class: "field" }, el("div", { class: "k" }, label), note ? el("div", { class: "note" }, note) : null, body);

/* ---------- Angaben eines Teils als Auswahl-Felder ----------
   Beim Hinzufügen mit den Vorschlägen der KI, beim Ändern mit den gespeicherten Werten.
   opt: { art, farbe, muster, material: { options, selected, note? }, aermel, schnitt, weite, laenge, bund, stil, saison: { selected },
          notiz, nichtAnziehen, saisonAuto (Saison folgt Art/Material, bis man sie selbst antippt), mehrOffen } */
const ALL_ARTS = GROUPS.map(([g, arts]) => [g, arts.map(([n]) => n)]);
// Gleiche Wörter wie in „Mein Stil“ (stil.js), damit die Vorschläge später Vorlieben und Teile direkt vergleichen können
export const STILRICHTUNGEN = ["lässig", "schick-lässig", "sportlich", "klassisch", "elegant", "Business", "minimalistisch", "romantisch", "Boho", "Streetwear", "Vintage", "rockig", "Preppy"];
// „mit Bündchen“ (z. B. Jogger) kennt die KI nicht, sie wählt es nie vor
export const HOSENSCHNITTE = [...names(LEGS), "mit Bündchen"];
// Weitere Merkmale (Etappe 1c). Die KI wählt hier nichts vor: Weite und Länge waren in der Messung unzuverlässig,
// Stil ist Geschmack. Gezeigt wird jedes Merkmal nur, wo es passt.
// feld = Name der Liste für selbst eingetippte Einträge (null = nicht erlaubt)
export const MERKMALE = {
  weite: { label: "Weite", feld: "Weite", werte: ["figurnah", "normal", "locker", "oversize"], passt: (a, g) => ["Oberteile", "Jacken & Mäntel", "Kleider & Einteiler"].includes(g) },
  laengeOben: { label: "Länge", feld: "Länge oben", werte: ["bauchfrei", "kurz", "normal", "lang"], passt: (a, g) => ["Oberteile", "Jacken & Mäntel"].includes(g) },
  laengeUnten: { label: "Länge", feld: "Länge Rock/Kleid", werte: ["mini", "knielang", "midi", "maxi", "knöchellang"], passt: (a, g) => a === "Rock" || g === "Kleider & Einteiler" },
  bund: { label: "Bund", feld: "Bund", werte: ["hohe Taille", "normale Höhe", "tief sitzend"], passt: (a, g) => g === "Unterteile" },
  stil: { label: "Stil", feld: "Stil", werte: STILRICHTUNGEN, passt: () => true, max: 2 },
  saison: { label: "Saison", feld: null, werte: ["Sommer", "Übergang", "Winter", "ganzjährig"], passt: () => true, max: 0, allein: ["ganzjährig"] }
};
// Wörter von vor 0.6.3 auf die gemeinsamen umstellen (läuft beim Start über alle Teile, ändert nur, was nötig ist)
const ALTE_WOERTER = { weite: { eng: "figurnah" }, bund: { normal: "normale Höhe", tief: "tief sitzend" } };
export function teilAngleichen(t) {
  let neu = null;
  for (const [k, alt] of Object.entries(ALTE_WOERTER)) if (t[k] && alt[t[k]]) (neu ??= { ...t })[k] = alt[t[k]];
  return neu;
}
// Saison-Vorschlag nach einfachen Regeln aus Art und Material (sie kann ihn jederzeit ändern)
const WARM = ["Strick / Wolle", "Kunstfell / Teddy", "Tweed", "Samt", "Cord", "Wildleder"], LEICHT = ["Leinen", "Chiffon", "Seide / Satin", "Spitze"];
export function saisonVorschlag(a, g, material) {
  if (["Shorts", "Top", "Sandalen"].includes(a) || g === "Bademode") return ["Sommer"];
  if (["Mantel", "Stiefel", "Handschuhe"].includes(a)) return ["Übergang", "Winter"];
  if (WARM.includes(material) || ["Pullover", "Strickjacke"].includes(a)) return ["Übergang", "Winter"];
  if (LEICHT.includes(material)) return ["Sommer"];
  if (a === "Jacke") return ["Übergang"];
  return ["ganzjährig"];
}
export const NICHT_ANZIEHEN = "🚫 Ziehe ich nicht an";
export function angabenFelder(opt, onChange = () => {}) {
  const art = choice({ field: "Art", options: opt.art.options, more: ALL_ARTS, selected: opt.art.selected, onChange: () => update(), groupDefault: () => groupOf(art.get()[0]) });
  const farbe = choice({ field: "Farbe", options: opt.farbe.options, more: FARB_NAMEN, selected: opt.farbe.selected, max: 2, withSwatch: true, onChange: () => update() });
  const muster = choice({ field: "Muster", options: opt.muster.options, selected: opt.muster.selected });
  const material = choice({ field: "Material", options: opt.material.options, more: names(MATERIALS).filter(n => !opt.material.options.includes(n)), selected: opt.material.selected, onChange: () => update() });
  // Ärmel und Hosenschnitt: feste Reihenfolge, nur wo sie passen
  const aermel = choice({ options: names(SLEEVES), selected: opt.aermel.selected });
  const schnitt = choice({ options: HOSENSCHNITTE, selected: opt.schnitt.selected });
  const fArmel = field("Ärmel", null, aermel.el), fSchnitt = field("Hosenschnitt", null, schnitt.el);
  // Weitere Merkmale: eigene Einträge erlaubt (außer Saison), eingeklappt unter „Mehr Angaben“
  let saisonAuto = !!opt.saisonAuto;
  const extra = Object.fromEntries(Object.entries(MERKMALE).map(([k, m]) => {
    const w = choice({ field: m.feld, options: m.werte, selected: opt[k]?.selected || [], max: m.max ?? 1, allein: m.allein,
      onChange: k === "saison" ? () => { saisonAuto = false; } : () => {} });
    return [k, { w, f: field(m.label, k === "saison" ? "Vorschlag nach Art und Material – antippen zum Ändern" : null, w.el), m }];
  }));
  const notiz = el("textarea", { class: "notiz", maxLength: 200, rows: 2, placeholder: "z. B. sitzt eng, nur mit Gürtel, fällt klein aus", value: opt.notiz || "", "aria-label": "Notiz" });
  const nicht = choice({ options: [NICHT_ANZIEHEN], selected: opt.nichtAnziehen ? [NICHT_ANZIEHEN] : [] });
  const mehr = el("details", { class: "mehr", open: !!opt.mehrOffen }, el("summary", {}, "Mehr Angaben (freiwillig): Passform, Länge, Stil, Saison, Notiz"),
    ...Object.values(extra).map(x => x.f), field("Notiz", null, notiz),
    field("Vorschläge", "Teil bleibt im Kleiderschrank, kommt aber nie in Outfit-Vorschläge.", nicht.el));
  const visible = () => {
    const a = art.get()[0], g = groupOf(a);
    fArmel.hidden = !HAS_SLEEVES.has(g); fSchnitt.hidden = !HAS_LEGS.has(a);
    for (const x of Object.values(extra)) x.f.hidden = !a || !x.m.passt(a, g);
    if (saisonAuto && a) extra.saison.w.set(saisonVorschlag(a, g, material.get()[0]));
  };
  const update = () => { visible(); onChange(); };
  visible();
  const wert = k => extra[k].f.hidden ? null : extra[k].w.get()[0] || null;
  return {
    elements: [field("Art", null, art.el), field("Farbe", "bis zu 2", farbe.el), field("Muster", null, muster.el),
      field("Material", opt.material.note || null, material.el), fArmel, fSchnitt, mehr],
    get: () => {
      const a = art.get()[0];
      return { art: a, gruppe: groupOf(a), farben: farbe.get(), muster: muster.get()[0] || null, material: material.get()[0] || null,
        aermel: fArmel.hidden ? null : aermel.get()[0] || null, schnitt: fSchnitt.hidden ? null : schnitt.get()[0] || null,
        weite: wert("weite"), laenge: wert("laengeOben") ?? wert("laengeUnten"), bund: wert("bund"),
        stil: extra.stil.w.get(), saison: extra.saison.w.get(), notiz: cleanText(notiz.value) || null, nichtAnziehen: nicht.get().length > 0 };
    },
    dispose: () => [art, farbe, muster, material, ...Object.values(extra).map(x => x.w)].forEach(w => w.dispose())
  };
}
// Für „Angaben ändern“: die gespeicherten Werte vorwählen, ähnliche Arten derselben Gruppe als Knöpfe anbieten
export function angabenVon(t) {
  const sameGroup = GROUPS.find(([g]) => g === t.gruppe)?.[1].map(([n]) => n) || [];
  return {
    art: { options: [...new Set([t.art, ...sameGroup])].slice(0, 4), selected: [t.art] },
    farbe: { options: t.farben || [], selected: t.farben || [] },
    muster: { options: names(PATTERNS), selected: t.muster ? [t.muster] : [] },
    material: { options: t.material ? [t.material] : [], selected: t.material ? [t.material] : [] },
    aermel: { selected: t.aermel ? [t.aermel] : [] },
    schnitt: { selected: t.schnitt ? [t.schnitt] : [] },
    weite: { selected: t.weite ? [t.weite] : [] }, bund: { selected: t.bund ? [t.bund] : [] },
    // Länge steht in einem Feld; sie gehört zu Oberteil- oder Rock/Kleid-Länge, je nach Art
    laengeOben: { selected: t.laenge && MERKMALE.laengeOben.passt(t.art, t.gruppe) ? [t.laenge] : [] },
    laengeUnten: { selected: t.laenge && !MERKMALE.laengeOben.passt(t.art, t.gruppe) ? [t.laenge] : [] },
    stil: { selected: t.stil || [] },
    // Teile von vor Version 0.5 haben noch keine Saison → Vorschlag nach Regel
    saison: { selected: t.saison || [] }, saisonAuto: !t.saison?.length,
    notiz: t.notiz || "", nichtAnziehen: !!t.nichtAnziehen, mehrOffen: true
  };
}
