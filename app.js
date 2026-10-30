// Kleidung hinzufügen → KI erkennt → mit einem Tippen korrigieren → mit fester Nummer speichern (Etappe 1a).
// Ansehen und Ordnen des Kleiderschranks steht in schrank.js (Etappe 1b), gemeinsame Bausteine in ui.js.
// Sicherheitsregel: Texte immer per textContent/DOM einsetzen, nie per innerHTML (gilt besonders für Eingetipptes).
// ?v= bei jeder Änderung von ki.js/speicher.js/ui.js hochzählen – in ALLEN Dateien gleich (und in index.html den von app.js/app.css),
// sonst nimmt das Handy die alte Datei aus seinem Zwischenspeicher
import { loadAI, recognize, loadImage, alsJpg, kiInfo } from "./ki.js?v=5";
import { addItem, allItems, askPersist, nrText, getFolders } from "./speicher.js?v=7";
import { $, el, fill, toast, choice, field, angabenFelder, beschreibung, customReady, zeigeGross, testAnzeige, setTestAnzeige } from "./ui.js?v=10";
import { refresh, initSchrank } from "./schrank.js?v=13";

// Nicht in fremde Seiten einbetten lassen (frame-ancestors geht per Meta-Tag nicht)
if (window.top !== window.self) { document.body.textContent = ""; throw new Error("eingebettet"); }

/* ---------- Fortschritt „Fotos erkannt: 3 von 10“ und „Alle speichern“ ---------- */
let total = 0, finished = 0;
const karten = new Map(); // fertig erkannte Karten → { bereit(), speichern() }
function updateProgress() {
  const open = $("pruefen").querySelectorAll(".check").length;
  // „Alle speichern“ lohnt sich ab 2 Karten, die gespeichert werden können (Art gewählt, nicht schon beim Speichern)
  const bereit = [...karten.values()].filter(k => k.bereit()).length, doppelt = [...karten.values()].filter(k => k.doppelt()).length;
  $("alleBox").hidden = bereit < 2;
  $("alleSpeichern").textContent = finished < total ? `Die ${bereit} fertigen speichern` : `Alle ${bereit} speichern`;
  $("alleDoppelt").hidden = !doppelt;
  $("alleDoppelt").textContent = `${doppelt === 1 ? "1 Foto" : doppelt + " Fotos"} mit „Vielleicht doppelt“ ${doppelt === 1 ? "wird" : "werden"} ausgelassen – bitte einzeln ansehen.`;
  if (total && finished >= total && !open) total = finished = 0;
  $("fortschritt").hidden = !total;
  if (!total) return;
  $("fortschrittBar").style.width = (100 * finished / total).toFixed(0) + "%";
  $("fortschrittText").textContent = finished < total ? `Fotos erkannt: ${finished} von ${total} …`
    : total === 1 ? "Foto erkannt. Bitte prüfen und speichern."
    : `Alle ${total} Fotos erkannt. Noch ${open} zum Prüfen und Speichern.`;
}

/* ---------- Doppelte Fotos ----------
   Zwei Prüfungen: genau dieselbe Datei (Fingerabdruck SHA-256 der Original-Datei, sicher) oder ein sehr ähnliches Foto
   (Bild-Vektor der KI, Ähnlichkeit ab GRENZE). Verglichen wird mit allen gespeicherten Teilen (auch im Papierkorb) und mit
   den Karten, die schon offen sind. Die App entscheidet nie selbst, sie weist nur darauf hin. */
// Gemessen 29.10.2026 (47 Fotos): verschiedene Teile höchstens 0,959 (zwei schwarze Schlaghosen), dasselbe Foto neu gespeichert,
// zugeschnitten oder leicht verändert mindestens 0,970. Ein NEUES Foto vom selben Teil lässt sich davon nicht sicher unterscheiden.
const GRENZE = 0.965;
const offene = new Map(); // Karte → { vektor, hash, titel(), url }
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
async function fingerabdruck(file) {
  try { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))].map(b => b.toString(16).padStart(2, "0")).join(""); }
  catch { return null; }
}
// Liefert den Treffer (oder null) und für die Testanzeige das ähnlichste Teil überhaupt und wie viele Teile Prüfdaten haben
async function findeDoppelt(vektor, hash) {
  let best = null, naechster = null;
  const pruefe = (v, h, quelle) => {
    if (!v && !h) return; // Teile von vor Version 0.7 haben keine Prüfdaten
    const gleich = !!hash && h === hash, sim = gleich ? 1 : v?.length === vektor.length ? dot(v, vektor) : 0;
    if (!naechster || sim > naechster.sim) naechster = { ...quelle, gleich, sim };
    if ((gleich || sim >= GRENZE) && (!best || sim > best.sim)) best = { ...quelle, gleich, sim };
  };
  const teile = await allItems();
  for (const t of teile) pruefe(t.vektor, t.hash, { teil: t });
  for (const x of offene.values()) pruefe(x.vektor, x.hash, { karte: x });
  return { treffer: best, naechster, mitDaten: teile.filter(t => t.vektor || t.hash).length, alle: teile.length };
}

/* ---------- Prüfen-Karte für ein Foto ---------- */
async function addPhoto(file, card) {
  card.replaceChildren(el("div", { class: "wait" }, "wird erkannt …"));
  await customReady;
  try {
    const hash = await fingerabdruck(file);
    const img = await loadImage(file);
    let r, foto, vorschau;
    try {
      r = await recognize(img);
      // Gespeichert wird das Foto verkleinert (ca. 1200 px) und eine kleine Vorschau (freigestellt, wenn das geklappt hat)
      foto = await alsJpg(img, 1200);
      vorschau = await alsJpg(r.cut || img, 400);
    } finally { r?.cut?.close(); URL.revokeObjectURL(img.src); }
    const vorschauUrl = URL.createObjectURL(vorschau);
    const pruefung = await findeDoppelt(r.vektor, hash), doppelt = pruefung.treffer;
    // Testanzeige: Messwerte der Doppel-Prüfung, um die Grenze an echten Handy-Fotos zu prüfen
    const n = pruefung.naechster, testZeile = testAnzeige() ? el("div", { class: "note" }, `Test: ${pruefung.mitDaten} von ${pruefung.alle} gespeicherten Teilen haben Prüfdaten. ` +
      (n ? `Ähnlichstes: ${n.teil ? "Nr. " + nrText(n.teil.nr) : "offene Karte"}, ${n.sim.toFixed(3).replace(".", ",")} (Grenze ${String(GRENZE).replace(".", ",")}), Fingerabdruck ${n.gleich ? "gleich" : "anders"}${hash ? "" : " (keiner berechnet)"}.`
        : "Nichts zum Vergleichen.") + ` KI rechnet: ${kiInfo.weg}${kiInfo.grund ? ` (${kiInfo.grund})` : ""}, ${kiInfo.sekunden.toFixed(1).replace(".", ",")} s.`) : null;

    const top = (list, n) => list.slice(0, n).map(c => c.label);
    const form = angabenFelder({
      art: { options: top(r.art, 3), selected: [r.art[0].label] },
      // Farbe: bis zu 2; die zweite nur vorwählen, wenn die KI sie für ähnlich wahrscheinlich hält (wie in der Testseite)
      farbe: { options: top(r.farbe, 5), selected: [r.farbe[0].label, ...r.farbe.slice(1, 2).filter(c => c.score >= 0.2).map(c => c.label)] },
      muster: { options: r.muster.map(c => c.label), selected: [r.muster[0].label] },
      // Material: KI wählt nichts vor (zu unsicher), wahrscheinlichste zuerst
      material: { options: top(r.material, 5), selected: [], note: "Bitte selbst antippen – die KI ist hier unsicher. Das Wahrscheinlichste steht vorn." },
      // Ärmel und Hosenschnitt: gemessen zuverlässig → vorwählen
      aermel: { selected: [r.aermel[0].label] }, schnitt: { selected: [r.schnitt[0].label] },
      // Weitere Merkmale ohne KI-Vorwahl; nur die Saison wird nach Art und Material vorgeschlagen
      saisonAuto: true
    }, () => update());
    // Eigene Ordner gleich mit auswählen (freiwillig); in „Mein Kleiderschrank“ ist jedes Teil sowieso.
    // Werden Ordner angelegt, umbenannt oder gelöscht, während die Karte offen ist, baut sich die Auswahl neu auf (Gewähltes bleibt).
    let folders = [], ordner = null;
    const ordnerBox = el("div");
    const gewaehlteOrdner = () => ordner ? folders.filter(f => ordner.get().includes(f.name)).map(f => f.id) : [];
    async function baueOrdner() {
      const vorher = gewaehlteOrdner();
      folders = await getFolders();
      ordner = folders.length ? choice({ options: folders.map(f => f.name), selected: folders.filter(f => vorher.includes(f.id)).map(f => f.name), max: 0 }) : null;
      fill(ordnerBox, ordner ? field("Ordner", "freiwillig – in „Mein Kleiderschrank“ ist es sowieso", ordner.el) : null);
    }
    await baueOrdner();
    const onOrdner = () => baueOrdner().catch(e => console.error(e));
    document.addEventListener("ordner-geaendert", onOrdner);
    const titel = el("div", { class: "titel" });

    let speichert = false;
    const save = el("button", { type: "button", class: "btn primary" }, "Speichern");
    const drop = el("button", { type: "button", class: "btn" }, "Verwerfen");
    function update() {
      const { art, farben } = form.get();
      titel.textContent = art ? `${art}${farben.length ? ", " + farben.join(" / ").toLowerCase() : ""}` : "Bitte Art wählen";
      save.disabled = !art || speichert;
      updateProgress();
    }
    // „Vielleicht doppelt“: Hinweis mit dem Foto des anderen Teils. „Alle speichern“ lässt die Karte aus,
    // bis sie verworfen oder mit „Ist ein anderes Teil“ bestätigt wird.
    let doppeltOffen = !!doppelt, doppeltUrl = null, doppeltBox = null;
    if (doppelt) {
      doppeltUrl = doppelt.teil ? URL.createObjectURL(doppelt.teil.vorschau) : null;
      const wer = doppelt.teil ? `Nr. ${nrText(doppelt.teil.nr)} – ${beschreibung(doppelt.teil)}${doppelt.teil.geloescht ? " (liegt im Papierkorb)" : ""}`
        : `„${doppelt.karte.titel()}“ weiter oben`;
      const text = doppelt.gleich ? (doppelt.teil ? `Dieses Foto ist schon gespeichert: ${wer}.` : `Dieses Foto ist zweimal ausgewählt, siehe ${wer}.`)
        : `Sieht aus wie ${wer}. Ist es dasselbe Teil?`;
      const behalten = el("button", { type: "button", class: "btn klein" }, "Ist ein anderes Teil – behalten");
      behalten.onclick = () => { doppeltOffen = false; doppeltBox.remove(); updateProgress(); };
      doppeltBox = el("div", { class: "doppelt" }, el("img", { src: doppeltUrl || doppelt.karte.url, alt: "" }),
        el("div", {}, el("strong", {}, "⚠️ Vielleicht doppelt"), el("div", {}, text),
          el("div", { class: "note" }, "Wenn ja: unten „Verwerfen“."), behalten));
    }
    offene.set(card, { vektor: r.vektor, hash, titel: () => titel.textContent, url: vorschauUrl });
    const removeCard = () => {
      karten.delete(card); offene.delete(card); document.removeEventListener("ordner-geaendert", onOrdner);
      URL.revokeObjectURL(vorschauUrl); if (doppeltUrl) URL.revokeObjectURL(doppeltUrl);
      form.dispose(); card.remove(); updateProgress();
    };
    // Speichert die Karte so, wie sie gerade angetippt ist; gibt die neue Nummer zurück (bei Fehler bleibt die Karte stehen)
    async function speichern() {
      speichert = true; update();
      try {
        const da = new Set((await getFolders()).map(f => f.id)); // nur Ordner, die es jetzt noch gibt
        const nr = await addItem({
          foto, vorschau, ...form.get(),
          ordner: gewaehlteOrdner().filter(id => da.has(id)),
          // Für die Doppel-Prüfung bei späteren Fotos
          hash, vektor: r.vektor,
          // Was die KI ursprünglich meinte, damit wir später sehen, wie oft korrigiert wurde
          ki: { art: r.art[0].label, farbe: r.farbe[0].label, muster: r.muster[0].label, material: r.material[0].label, aermel: r.aermel[0].label, schnitt: r.schnitt[0].label }
        });
        removeCard();
        return nr;
      } catch (e) { speichert = false; update(); throw e; }
    }
    save.onclick = async () => {
      try { const nr = await speichern(); toast(`Gespeichert als Nr. ${nrText(nr)}`); nachSpeichern(); }
      catch (e) { toast("Speichern hat nicht geklappt: " + (e?.message || e)); console.error(e); }
    };
    drop.onclick = () => { if (confirm("Dieses Foto verwerfen?\n\nEs wird nicht gespeichert.")) removeCard(); };
    karten.set(card, { bereit: () => !speichert && !!form.get().art && !doppeltOffen, doppelt: () => doppeltOffen, speichern });

    // Vorschau antippen → ganzes Foto groß (nicht das ausgeschnittene, damit man Details sieht)
    const lupe = el("button", { type: "button", class: "lupe", "aria-label": "Foto groß anzeigen" }, el("img", { src: vorschauUrl, alt: "" }), el("span", {}, "🔍"));
    lupe.onclick = () => { const u = URL.createObjectURL(foto); zeigeGross(u, "", () => URL.revokeObjectURL(u)); };
    fill(card,
      el("div", { class: "top" }, lupe, titel),
      doppeltBox, testZeile,
      ...form.elements,
      ordnerBox,
      el("div", { class: "actions" }, drop, save)
    );
    update();
  } catch (e) {
    karten.delete(card); offene.delete(card);
    card.replaceChildren(el("div", { class: "wait" }, `❌ ${file.name}: ${e?.message || e}`),
      el("div", { class: "actions" }, el("button", { type: "button", class: "btn", onclick: () => { card.remove(); updateProgress(); } }, "Entfernen")));
    console.error(e);
  } finally {
    finished++; updateProgress();
  }
}

const nachSpeichern = () => { askPersist(); refresh(); };
// Alle fertig erkannten Karten nacheinander speichern (in der Reihenfolge der Fotos, so steigen die Nummern wie angezeigt)
$("alleSpeichern").onclick = async () => {
  const b = $("alleSpeichern"); b.disabled = true;
  const nrs = []; let fehler = 0;
  for (const k of [...karten.values()]) {
    if (!k.bereit()) continue;
    try { nrs.push(await k.speichern()); } catch (e) { fehler++; console.error(e); }
  }
  b.disabled = false;
  const ok = nrs.length === 1 ? `Gespeichert als Nr. ${nrText(nrs[0])}`
    : nrs.length ? `${nrs.length} Teile gespeichert (Nr. ${nrText(Math.min(...nrs))} bis ${nrText(Math.max(...nrs))})` : "";
  toast(fehler ? `${ok}${ok ? ". " : ""}${fehler === 1 ? "1 Teil hat" : fehler + " Teile haben"} nicht geklappt – bitte einzeln speichern.` : ok);
  if (nrs.length) nachSpeichern();
  updateProgress();
};
// Testanzeige an/aus: 5× innerhalb von 3 Sekunden auf die Versionsnummer tippen
let taps = [];
$("version").onclick = () => {
  const jetzt = Date.now(); taps = [...taps.filter(t => jetzt - t < 3000), jetzt];
  if (taps.length < 5) return;
  taps = []; const an = !testAnzeige(); setTestAnzeige(an);
  toast(an ? "Testanzeige an" : "Testanzeige aus"); refresh();
};
// Noch nicht gespeicherte Karten: beim Schließen oder Neuladen nachfragen (am PC; Safari auf dem iPhone fragt meist nicht)
addEventListener("beforeunload", e => { if ($("pruefen").querySelector(".check")) { e.preventDefault(); e.returnValue = ""; } });

/* ---------- Start ---------- */
initSchrank().catch(e => { $("kacheln").replaceChildren(el("p", { class: "hint" }, "Speicher konnte nicht geöffnet werden: " + (e?.message || e))); });
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
