// Kleidung hinzufügen → KI erkennt → mit einem Tippen korrigieren → mit fester Nummer speichern (Etappe 1a).
// Ansehen und Ordnen des Kleiderschranks steht in schrank.js (Etappe 1b), gemeinsame Bausteine in ui.js.
// Sicherheitsregel: Texte immer per textContent/DOM einsetzen, nie per innerHTML (gilt besonders für Eingetipptes).
// ?v= bei jeder Änderung von ki.js/speicher.js/ui.js hochzählen – in ALLEN Dateien gleich (und in index.html den von app.js/app.css),
// sonst nimmt das Handy die alte Datei aus seinem Zwischenspeicher
import { loadAI, recognize, loadImage, toCanvas, canvasToBlob } from "./ki.js?v=3";
import { addItem, askPersist, nrText, getFolders } from "./speicher.js?v=3";
import { $, el, fill, toast, choice, field, angabenFelder, customReady } from "./ui.js?v=1";
import { refresh, initSchrank } from "./schrank.js?v=1";

// Nicht in fremde Seiten einbetten lassen (frame-ancestors geht per Meta-Tag nicht)
if (window.top !== window.self) { document.body.textContent = ""; throw new Error("eingebettet"); }

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
    const form = angabenFelder({
      art: { options: top(r.art, 3), selected: [r.art[0].label] },
      // Farbe: bis zu 2; die zweite nur vorwählen, wenn die KI sie für ähnlich wahrscheinlich hält (wie in der Testseite)
      farbe: { options: top(r.farbe, 5), selected: [r.farbe[0].label, ...r.farbe.slice(1, 2).filter(c => c.score >= 0.2).map(c => c.label)] },
      muster: { options: r.muster.map(c => c.label), selected: [r.muster[0].label] },
      // Material: KI wählt nichts vor (zu unsicher), wahrscheinlichste zuerst
      material: { options: top(r.material, 5), selected: [], note: "Bitte selbst antippen – die KI ist hier unsicher. Das Wahrscheinlichste steht vorn." },
      // Ärmel und Hosenschnitt: gemessen zuverlässig → vorwählen
      aermel: { selected: [r.aermel[0].label] }, schnitt: { selected: [r.schnitt[0].label] }
    }, () => update());
    // Eigene Ordner gleich mit auswählen (freiwillig); in „Mein Kleiderschrank“ ist jedes Teil sowieso
    const folders = await getFolders();
    const ordner = folders.length ? choice({ options: folders.map(f => f.name), max: 0 }) : null;
    const titel = el("div", { class: "titel" });

    function update() {
      const { art, farben } = form.get();
      titel.textContent = art ? `${art}${farben.length ? ", " + farben.join(" / ").toLowerCase() : ""}` : "Bitte Art wählen";
      save.disabled = !art;
    }
    const removeCard = () => { URL.revokeObjectURL(vorschauUrl); form.dispose(); card.remove(); updateProgress(); };
    const save = el("button", { type: "button", class: "btn primary" }, "Speichern");
    const drop = el("button", { type: "button", class: "btn" }, "Verwerfen");
    save.onclick = async () => {
      save.disabled = true;
      try {
        const nr = await addItem({
          foto, vorschau, ...form.get(),
          ordner: ordner ? folders.filter(f => ordner.get().includes(f.name)).map(f => f.id) : [],
          // Was die KI ursprünglich meinte, damit wir später sehen, wie oft korrigiert wurde
          ki: { art: r.art[0].label, farbe: r.farbe[0].label, muster: r.muster[0].label, material: r.material[0].label, aermel: r.aermel[0].label, schnitt: r.schnitt[0].label }
        });
        removeCard();
        toast(`Gespeichert als Nr. ${nrText(nr)}`);
        askPersist();
        refresh();
      } catch (e) { save.disabled = false; toast("Speichern hat nicht geklappt: " + (e?.message || e)); console.error(e); }
    };
    drop.onclick = removeCard;

    fill(card,
      el("div", { class: "top" }, el("img", { src: vorschauUrl, alt: "" }), titel),
      ...form.elements,
      ordner ? field("Ordner", "freiwillig – in „Mein Kleiderschrank“ ist es sowieso", ordner.el) : null,
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
