// Etappe 1a: Kleidung hinzufügen → KI erkennt → mit einem Tippen korrigieren → mit fester Nummer speichern.
// Sicherheitsregel: Texte immer per textContent/DOM einsetzen, nie per innerHTML.
// ?v= bei jeder Änderung von ki.js/speicher.js hochzählen (und in index.html den von app.js/app.css),
// sonst nimmt das Handy die alte Datei aus seinem Zwischenspeicher
import { loadAI, recognize, loadImage, toCanvas, canvasToBlob, GROUPS, GROUP_OF, COLORS, MATERIALS, SLEEVES, LEGS, HAS_SLEEVES, HAS_LEGS } from "./ki.js?v=1";
import { addItem, allItems, askPersist, nrText } from "./speicher.js?v=1";

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

/* ---------- Auswahl-Knöpfe ----------
   options: sichtbare Knöpfe (in dieser Reihenfolge), more: weitere Werte im Auswahlfeld „Andere …“ ([Gruppe, [Werte]] oder [Werte]),
   selected: vorgewählte Werte, max: wie viele gleichzeitig (1 = nur einer), onChange: wird nach jeder Änderung gerufen */
function choice({ options, more = [], selected = [], max = 1, withSwatch = false, onChange = () => {} }) {
  const sel = new Set(selected), wrap = el("div", { class: "chips" }), buttons = new Map();
  const addButton = (value, before = null) => {
    const b = el("button", { type: "button", class: "chip" }, withSwatch ? swatch(value) : null, value);
    b.onclick = () => toggle(value);
    buttons.set(value, b); wrap.insertBefore(b, before); return b;
  };
  const render = () => { for (const [v, b] of buttons) b.setAttribute("aria-pressed", sel.has(v)); };
  function toggle(value) {
    if (sel.has(value)) sel.delete(value);
    else { if (max === 1) sel.clear(); else if (sel.size >= max) sel.delete([...sel][0]); sel.add(value); }
    render(); onChange([...sel]);
  }
  options.forEach(v => addButton(v));
  if (more.length) {
    const s = el("select", { "aria-label": "Andere auswählen" }, el("option", { value: "" }, "Andere …"));
    for (const m of more) {
      if (Array.isArray(m)) { const g = el("optgroup", { label: m[0] }); m[1].forEach(v => g.append(el("option", { value: v }, v))); s.append(g); }
      else s.append(el("option", { value: m }, m));
    }
    s.onchange = () => { const v = s.value; s.value = ""; if (!v) return; if (!buttons.has(v)) addButton(v, s); if (!sel.has(v)) toggle(v); };
    wrap.append(s);
  }
  render();
  return { el: wrap, get: () => [...sel] };
}
const field = (label, note, body) => el("div", { class: "field" }, el("div", { class: "k" }, label), note ? el("div", { class: "note" }, note) : null, body);

/* ---------- Prüfen-Karte für ein Foto ---------- */
const ALL_ARTS = GROUPS.map(([g, arts]) => [g, arts.map(([n]) => n)]);
const names = list => list.map(([n]) => n);
async function addPhoto(file) {
  const card = el("div", { class: "check" }, el("div", { class: "wait" }, `${file.name}: wird erkannt …`));
  $("pruefen").append(card);
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
    const art = choice({ options: top(r.art, 3), more: ALL_ARTS, selected: [r.art[0].label], onChange: () => update() });
    // Farbe: bis zu 2; die zweite nur vorwählen, wenn die KI sie für ähnlich wahrscheinlich hält (wie in der Testseite)
    const farbe = choice({ options: top(r.farbe, 5), more: names(COLORS), selected: [r.farbe[0].label, ...r.farbe.slice(1, 2).filter(c => c.score >= 0.2).map(c => c.label)], max: 2, withSwatch: true, onChange: () => update() });
    const muster = choice({ options: r.muster.map(c => c.label), selected: [r.muster[0].label] });
    // Material: KI wählt nichts vor (zu unsicher), wahrscheinlichste zuerst
    const material = choice({ options: top(r.material, 5), more: names(MATERIALS).filter(n => !top(r.material, 5).includes(n)) });
    // Ärmel und Hosenschnitt: gemessen zuverlässig → vorwählen, feste Reihenfolge
    const aermel = choice({ options: names(SLEEVES), selected: [r.aermel[0].label] });
    const schnitt = choice({ options: names(LEGS), selected: [r.schnitt[0].label] });
    const fArmel = field("Ärmel", null, aermel.el), fSchnitt = field("Hosenschnitt", null, schnitt.el);
    const titel = el("div", { class: "titel" });

    function update() {
      const a = art.get()[0], g = GROUP_OF.get(a);
      fArmel.hidden = !HAS_SLEEVES.has(g); fSchnitt.hidden = !HAS_LEGS.has(a);
      titel.textContent = a ? `${a}${farbe.get().length ? ", " + farbe.get().join(" / ").toLowerCase() : ""}` : "Bitte Art wählen";
      save.disabled = !a;
    }
    const save = el("button", { type: "button", class: "btn primary" }, "Speichern");
    const drop = el("button", { type: "button", class: "btn" }, "Verwerfen");
    save.onclick = async () => {
      save.disabled = true;
      const a = art.get()[0];
      try {
        const nr = await addItem({
          foto, vorschau, art: a, gruppe: GROUP_OF.get(a), farben: farbe.get(), muster: muster.get()[0] || null, material: material.get()[0] || null,
          aermel: fArmel.hidden ? null : aermel.get()[0] || null, schnitt: fSchnitt.hidden ? null : schnitt.get()[0] || null,
          // Was die KI ursprünglich meinte, damit wir später sehen, wie oft korrigiert wurde
          ki: { art: r.art[0].label, farbe: r.farbe[0].label, muster: r.muster[0].label, material: r.material[0].label, aermel: r.aermel[0].label, schnitt: r.schnitt[0].label }
        });
        URL.revokeObjectURL(vorschauUrl); card.remove();
        toast(`Gespeichert als Nr. ${nrText(nr)}`);
        askPersist();
        showCloset();
      } catch (e) { save.disabled = false; toast("Speichern hat nicht geklappt: " + (e?.message || e)); console.error(e); }
    };
    drop.onclick = () => { URL.revokeObjectURL(vorschauUrl); card.remove(); };

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
    card.replaceChildren(el("div", { class: "wait" }, `❌ ${file.name}: ${e.message}`), el("div", { class: "actions" }, el("button", { type: "button", class: "btn", onclick: () => card.remove() }, "Entfernen")));
    console.error(e);
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
  // Fotos nacheinander erkennen (spart Speicher auf dem Handy); fertige Karten kann man schon speichern
  for (const f of list) queue = queue.then(() => addPhoto(f));
});
try {
  const msg = await loadAI((share, mb, total) => {
    $("barfill").style.width = (100 * share).toFixed(0) + "%";
    $("status").textContent = `KI wird geladen … ${mb.toFixed(0)} von ${total.toFixed(0)} MB`;
  });
  $("barfill").style.width = "100%";
  if (msg) { $("status").textContent = msg; }
  else {
    $("status").textContent = "✅ KI ist bereit.";
    $("uploadLabel").classList.remove("disabled");
    setTimeout(() => { $("kiPanel").hidden = true; }, 1500);
  }
} catch (e) {
  $("status").textContent = "❌ KI konnte nicht geladen werden: " + e.message;
  console.error(e);
}
