// Etappe 1a: Kleidung hinzufügen → KI erkennt → mit einem Tippen korrigieren → mit fester Nummer speichern.
// Sicherheitsregel: Texte immer per textContent/DOM einsetzen, nie per innerHTML (gilt besonders für Eingetipptes).
// ?v= bei jeder Änderung von ki.js/speicher.js hochzählen (und in index.html den von app.js/app.css),
// sonst nimmt das Handy die alte Datei aus seinem Zwischenspeicher
import { loadAI, recognize, loadImage, toCanvas, canvasToBlob, GROUPS, GROUP_OF, COLORS, MATERIALS, SLEEVES, LEGS, HAS_SLEEVES, HAS_LEGS } from "./ki.js?v=2";
import { addItem, allItems, askPersist, nrText, getCustom, setCustom } from "./speicher.js?v=2";

// Nicht in fremde Seiten einbetten lassen (frame-ancestors geht per Meta-Tag nicht)
if (window.top !== window.self) { document.body.textContent = ""; throw new Error("eingebettet"); }

const $ = id => document.getElementById(id);
const COLOR_RGB = new Map(COLORS.map(([n, , rgb]) => [n, rgb]));
function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) if (k === "class") e.className = v; else if (k in e) e[k] = v; else e.setAttribute(k, v);
  e.append(...kids.filter(k => k != null)); return e;
}
function toast(text) {
  const t = $("toast"); t.textContent = text; t.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 2500);
}
const swatch = name => COLOR_RGB.has(name) ? el("span", { class: "sw", style: `background:rgb(${COLOR_RGB.get(name).join(",")})` }) : null;

/* ---------- Eigene Einträge („Andere …“ → selbst eintippen) ----------
   Pro Merkmal eine Liste, dauerhaft auf dem Gerät gespeichert. Ein neuer eigener Eintrag erscheint sofort als Knopf
   in allen offenen Karten und beim nächsten Mal wieder. Löschen entfernt nur den Knopf; Teile, die den Wert
   schon haben, behalten ihn. Bei eigenen Arten wird gefragt, wozu sie gehören (für spätere Outfit-Regeln). */
let custom = {};
const customReady = getCustom().then(c => { custom = c; }).catch(e => console.error(e));
const customValues = f => (custom[f] || []).map(c => c.wert);
const groupOf = a => GROUP_OF.get(a) ?? (custom.Art || []).find(c => c.wert === a)?.gruppe ?? null;
const widgets = new Set(); // offene Auswahl-Felder mit eigenen Einträgen
async function addCustom(f, wert, gruppe) {
  const next = { ...custom, [f]: [...(custom[f] || []), gruppe ? { wert, gruppe } : { wert }] };
  await setCustom(next); custom = next;
  for (const w of widgets) if (w.field === f) w.addOption(wert);
}
async function removeCustom(f, wert) {
  const next = { ...custom, [f]: (custom[f] || []).filter(c => c.wert !== wert) };
  await setCustom(next); custom = next;
  for (const w of widgets) if (w.field === f) w.removeOption(wert);
}
const clean = s => s.replace(/\s+/g, " ").trim();
const EXAMPLE = { Art: "z. B. Kimono", Farbe: "z. B. Petrol", Muster: "z. B. Paisley", Material: "z. B. Viskose" };

/* ---------- Auswahl-Knöpfe ----------
   options: sichtbare Knöpfe (in dieser Reihenfolge), more: weitere Werte im Auswahlfeld „Andere …“ ([Gruppe, [Werte]] oder [Werte]),
   selected: vorgewählte Werte, max: wie viele gleichzeitig (1 = nur einer), onChange: wird nach jeder Änderung gerufen,
   field: Name des Merkmals, wenn man eigene Einträge eintippen darf, groupDefault: Vorschlag „Gehört zu“ bei eigener Art */
function choice({ field = null, options, more = [], selected = [], max = 1, withSwatch = false, onChange = () => {}, groupDefault = null }) {
  const sel = new Set(selected), wrap = el("div", { class: "chips" }), buttons = new Map();
  const editor = el("div", { class: "eigen-edit" }); editor.hidden = true;
  let picker = null; // Auswahlfeld „Andere …“
  const render = () => { for (const [v, b] of buttons) b.setAttribute("aria-pressed", sel.has(v)); };
  function toggle(value) {
    if (sel.has(value)) sel.delete(value);
    else { if (max === 1) sel.clear(); else if (sel.size >= max) sel.delete([...sel][0]); sel.add(value); }
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
    const input = el("input", { type: "text", maxLength: 30, placeholder: EXAMPLE[field] || "", "aria-label": "Eigener Eintrag", autocomplete: "off" });
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
  selected.forEach(v => addButton(v)); // falls ein vorgewählter Wert nicht unter den Knöpfen ist
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
    addOption: v => addButton(v, true),
    // Knopf nur entfernen, wenn er hier gerade nicht ausgewählt ist
    removeOption: v => { const b = buttons.get(v); if (b?.classList.contains("eigen") && !sel.has(v)) { b.remove(); buttons.delete(v); } },
    dispose: () => widgets.delete(w)
  };
  if (field) widgets.add(w);
  return w;
}
const field = (label, note, body) => el("div", { class: "field" }, el("div", { class: "k" }, label), note ? el("div", { class: "note" }, note) : null, body);

/* ---------- Fortschritt „Fotos erkannt: 3 von 10“ ---------- */
let total = 0, finished = 0;
function updateProgress() {
  const open = $("pruefen").querySelectorAll(".check").length;
  if (total && finished >= total && !open) total = finished = 0;
  $("fortschritt").hidden = !total;
  if (!total) return;
  $("fortschrittBar").style.width = (100 * finished / total).toFixed(0) + "%";
  $("fortschrittText").textContent = finished < total
    ? `Fotos erkannt: ${finished} von ${total} …`
    : `Alle ${total} ${total === 1 ? "Foto" : "Fotos"} erkannt. Noch ${open} zum Prüfen und Speichern.`;
}

/* ---------- Prüfen-Karte für ein Foto ---------- */
const ALL_ARTS = GROUPS.map(([g, arts]) => [g, arts.map(([n]) => n)]);
const names = list => list.map(([n]) => n);
async function addPhoto(file, card) {
  card.replaceChildren(el("div", { class: "wait" }, "wird erkannt …"));
  await customReady;
  try {
    const img = await loadImage(file);
    let r, foto, vorschau;
    try {
      r = await recognize(img);
      // Gespeichert wird das Foto verkleinert (ca. 1200 px) und eine kleine Vorschau (freigestellt, wenn das geklappt hat)
      foto = await canvasToBlob(toCanvas(img, 1200, true), 0.85);
      vorschau = await canvasToBlob(toCanvas(r.cut || img, 400, true), 0.85);
    } finally { URL.revokeObjectURL(img.src); }
    const vorschauUrl = URL.createObjectURL(vorschau);

    const top = (list, n) => list.slice(0, n).map(c => c.label);
    const art = choice({ field: "Art", options: top(r.art, 3), more: ALL_ARTS, selected: [r.art[0].label], onChange: () => update(), groupDefault: () => groupOf(art.get()[0]) });
    // Farbe: bis zu 2; die zweite nur vorwählen, wenn die KI sie für ähnlich wahrscheinlich hält (wie in der Testseite)
    const farbe = choice({ field: "Farbe", options: top(r.farbe, 5), more: names(COLORS), selected: [r.farbe[0].label, ...r.farbe.slice(1, 2).filter(c => c.score >= 0.2).map(c => c.label)], max: 2, withSwatch: true, onChange: () => update() });
    const muster = choice({ field: "Muster", options: r.muster.map(c => c.label), selected: [r.muster[0].label] });
    // Material: KI wählt nichts vor (zu unsicher), wahrscheinlichste zuerst
    const material = choice({ field: "Material", options: top(r.material, 5), more: names(MATERIALS).filter(n => !top(r.material, 5).includes(n)) });
    // Ärmel und Hosenschnitt: gemessen zuverlässig → vorwählen, feste Reihenfolge
    const aermel = choice({ options: names(SLEEVES), selected: [r.aermel[0].label] });
    const schnitt = choice({ options: names(LEGS), selected: [r.schnitt[0].label] });
    const fArmel = field("Ärmel", null, aermel.el), fSchnitt = field("Hosenschnitt", null, schnitt.el);
    const titel = el("div", { class: "titel" });

    function update() {
      const a = art.get()[0];
      fArmel.hidden = !HAS_SLEEVES.has(groupOf(a)); fSchnitt.hidden = !HAS_LEGS.has(a);
      titel.textContent = a ? `${a}${farbe.get().length ? ", " + farbe.get().join(" / ").toLowerCase() : ""}` : "Bitte Art wählen";
      save.disabled = !a;
    }
    const removeCard = () => { URL.revokeObjectURL(vorschauUrl); [art, farbe, muster, material].forEach(w => w.dispose()); card.remove(); updateProgress(); };
    const save = el("button", { type: "button", class: "btn primary" }, "Speichern");
    const drop = el("button", { type: "button", class: "btn" }, "Verwerfen");
    save.onclick = async () => {
      save.disabled = true;
      const a = art.get()[0];
      try {
        const nr = await addItem({
          foto, vorschau, art: a, gruppe: groupOf(a), farben: farbe.get(), muster: muster.get()[0] || null, material: material.get()[0] || null,
          aermel: fArmel.hidden ? null : aermel.get()[0] || null, schnitt: fSchnitt.hidden ? null : schnitt.get()[0] || null,
          // Was die KI ursprünglich meinte, damit wir später sehen, wie oft korrigiert wurde
          ki: { art: r.art[0].label, farbe: r.farbe[0].label, muster: r.muster[0].label, material: r.material[0].label, aermel: r.aermel[0].label, schnitt: r.schnitt[0].label }
        });
        removeCard();
        toast(`Gespeichert als Nr. ${nrText(nr)}`);
        askPersist();
        showCloset();
      } catch (e) { save.disabled = false; toast("Speichern hat nicht geklappt: " + (e?.message || e)); console.error(e); }
    };
    drop.onclick = removeCard;

    card.replaceChildren(
      el("div", { class: "top" }, el("img", { src: vorschauUrl, alt: "" }), titel),
      field("Art", null, art.el),
      field("Farbe", "bis zu 2", farbe.el),
      field("Muster", null, muster.el),
      field("Material", "Bitte selbst antippen – die KI ist hier unsicher. Das Wahrscheinlichste steht vorn.", material.el),
      fArmel, fSchnitt,
      el("div", { class: "actions" }, drop, save)
    );
    update();
  } catch (e) {
    card.replaceChildren(el("div", { class: "wait" }, `❌ ${file.name}: ${e?.message || e}`),
      el("div", { class: "actions" }, el("button", { type: "button", class: "btn", onclick: () => { card.remove(); updateProgress(); } }, "Entfernen")));
    console.error(e);
  } finally {
    finished++; updateProgress();
  }
}

/* ---------- Gespeicherte Teile ---------- */
let urls = [];
async function showCloset() {
  const items = (await allItems()).sort((a, b) => b.nr - a.nr);
  urls.forEach(u => URL.revokeObjectURL(u)); urls = [];
  $("schrank").replaceChildren(...items.map(t => {
    const u = URL.createObjectURL(t.vorschau); urls.push(u);
    const beschr = `${t.art}${t.farben.length ? ", " + t.farben.join(" / ").toLowerCase() : ""}`;
    return el("div", { class: "teil" },
      el("div", { class: "bild" }, el("img", { src: u, alt: beschr, loading: "lazy" }), el("span", { class: "plakette" }, nrText(t.nr))),
      el("div", { class: "text" }, `Nr. ${nrText(t.nr)} – ${beschr}`));
  }));
  $("schrankTitel").textContent = `Gespeichert (${items.length} ${items.length === 1 ? "Teil" : "Teile"})`;
  $("leer").hidden = items.length > 0;
}

/* ---------- Start ---------- */
showCloset().catch(e => { $("leer").textContent = "Speicher konnte nicht geöffnet werden: " + e.message; });
let queue = Promise.resolve();
$("files").addEventListener("change", ev => {
  const list = [...ev.target.files]; ev.target.value = "";
  if (!list.length) return;
  total += list.length; updateProgress();
  // Fotos nacheinander erkennen (spart Speicher auf dem Handy); fertige Karten kann man schon speichern.
  // Für jedes Foto sofort eine Karte „wartet …“, damit man sieht, was noch kommt.
  for (const f of list) {
    const card = el("div", { class: "check" }, el("div", { class: "wait" }, "wartet auf die Erkennung …"));
    $("pruefen").append(card);
    queue = queue.then(() => addPhoto(f, card));
  }
});
// Häufigster Fehler beim ersten Start: der Download (ca. 100 MB) reißt ab, z. B. weil die App kurz verlassen,
// der Bildschirm gesperrt wurde oder das WLAN weg war. Dann einmal von selbst neu versuchen, sobald die App
// wieder im Vordergrund ist, sonst per Knopf. Schon fertig geladene Dateien bleiben im Speicher.
let aiState = "aus", aiTries = 0; // aus | lädt | bereit
async function startAI() {
  if (aiState !== "aus") return;
  aiState = "lädt"; aiTries++;
  $("kiPanel").hidden = false; $("kiHilfe").hidden = true; $("kiRetry").hidden = true; $("kiLaden").hidden = false;
  $("barfill").style.width = "0"; $("status").textContent = "KI wird geladen …";
  try {
    const msg = await loadAI((share, mb, total) => {
      $("barfill").style.width = (100 * share).toFixed(0) + "%";
      $("status").textContent = `KI wird geladen … ${mb.toFixed(0)} von ${total.toFixed(0)} MB`;
    });
    aiState = "bereit"; $("kiLaden").hidden = true;
    $("barfill").style.width = "100%";
    if (msg) { $("status").textContent = msg; }
    else {
      $("status").textContent = "✅ KI ist bereit.";
      $("uploadLabel").classList.remove("disabled");
      setTimeout(() => { $("kiPanel").hidden = true; }, 1500);
    }
  } catch (e) {
    aiState = "aus"; $("kiLaden").hidden = true;
    const wo = e.dateien?.length ? ` (bei ${e.dateien.join(", ")})` : "";
    $("status").textContent = `❌ Die KI konnte nicht geladen werden${wo}: ${e?.message || e}`;
    $("kiHilfe").hidden = false; $("kiRetry").hidden = false;
    console.error(e);
    if (aiTries === 1) retryWhenVisible();
  }
}
function retryWhenVisible() {
  const onVisible = () => { if (document.visibilityState !== "visible") return; document.removeEventListener("visibilitychange", onVisible); setTimeout(startAI, 1500); };
  document.addEventListener("visibilitychange", onVisible); onVisible();
}
$("kiRetry").onclick = () => startAI();

/* ---------- Home-Bildschirm ----------
   Im normalen Safari darf das iPhone die Daten nach 7 Tagen ohne Nutzung löschen, als App auf dem Home-Bildschirm nicht.
   Die App dort hat ihren eigenen Speicher. Darum: im Browser auf dem Handy zuerst den Hinweis zeigen und die KI
   (ca. 100 MB) erst laden, wenn sie sich bewusst für den Browser entscheidet. Am PC kein Hinweis. */
const standalone = navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const mobile = ios || matchMedia("(pointer: coarse)").matches;
// Nur eine Bequemlichkeit für dieses Gerät; fehlt der Speicher, kommt der Hinweis eben wieder
const remember = { get: () => { try { return localStorage.getItem("imBrowserOk") === "1"; } catch { return false; } },
  set: () => { try { localStorage.setItem("imBrowserOk", "1"); } catch {} } };
askPersist();
if (mobile && !standalone) {
  $(ios ? "schritteIos" : "schritteAndere").hidden = false;
  $("warnMehr").onclick = () => { $("homeHinweis").hidden = !$("homeHinweis").hidden; };
  const browserOk = () => { $("homeHinweis").hidden = true; $("warnzeile").hidden = false; };
  $("imBrowser").onclick = browserOk;
  if (remember.get()) { browserOk(); startAI(); }
  else {
    $("homeHinweis").hidden = false; $("kiPanel").hidden = true;
    $("imBrowser").onclick = () => { remember.set(); browserOk(); $("imBrowser").onclick = browserOk; startAI(); };
  }
} else startAI();
