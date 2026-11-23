// Kleine Bewegungen, damit sich die App beim Tippen „echter“ anfühlt (seit 0.37, Wunsch 23.11.2026: „Haptik schöner gestalten“).
// 1. Drück-Effekt: Knöpfe, Kacheln und Fotos werden beim Antippen kurz etwas kleiner (app.css :active). Safari auf dem iPhone
//    zeigt :active nur, wenn die Seite auf Berührungen hört – darum ein leerer touchstart-Zuhörer.
// 2. Gleiten: Umschalter wie „♻️ Aussortiert“ und im Haushalt bekommen einen rosa Hintergrund, der zur gewählten Seite gleitet
//    (gleiten()). Die Ansicht wird beim Umschalten neu gezeichnet; darum startet der Hintergrund an der alten Stelle und gleitet
//    dann zur neuen.
// 4. Klappen: Tippt man eine Überschrift zum Aufklappen an, blendet der Inhalt weich ein (nur beim Antippen, nicht bei jedem
//    Neuzeichnen einer schon offenen Klappe).
// 5. Pop: Ein angetippter Auswahl-Knopf ploppt kurz auf (app.css .pop).
// 6. Ruhig neu zeichnen (seit 0.38, iPhone-Test 23.11.2026): „💰 Will ich verkaufen“ räumte die Teil-Ansicht sofort um
//    (Verkaufen nach oben, Angaben eingeklappt), die Seite wurde kürzer und sprang – das wirkte wie ein Fehler. Seitdem:
//    - festeAnordnung(): Eine Ansicht behält ihre Anordnung, bis man sie verlässt. Beim nächsten Öffnen steht alles am neuen Platz.
//    - ankerMerken()/ankerHalten(): Der Bereich, in dem getippt wurde (data-anker, z. B. Verkaufen, Verleihen), steht nach dem
//      Neuzeichnen an derselben Stelle auf dem Bildschirm, geht weich auf seine neue Höhe und leuchtet kurz rosé auf.
//    - weichAendern(): Ändert sich nur ein Bereich selbst (z. B. „🤝 Verleihen …“ → Formular), geht seine Höhe weich mit.
// Wer im iPhone „Bewegung reduzieren“ eingeschaltet hat, bekommt das alles ohne Animation (app.css, ruhig()).

const vorher = new Map(); // Umschalter → zuletzt gewählter Schlüssel (data-k des Knopfs)
const ruhig = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
let letzterTipp = null; // { el, zeit }: wo zuletzt getippt wurde (für ankerMerken)

// box = Umschalter (.chips.umschalter) mit Knöpfen, die aria-pressed und data-k tragen; schluessel = welcher Umschalter
export function gleiten(box, schluessel) {
  if (!box) return box;
  const knoepfe = [...box.children].filter(k => k.tagName === "BUTTON");
  const jetzt = knoepfe.findIndex(k => k.getAttribute("aria-pressed") === "true");
  if (jetzt < 0) return box;
  const alt = vorher.get(schluessel), altIndex = alt == null ? -1 : knoepfe.findIndex(k => k.dataset.k === alt);
  const g = document.createElement("span");
  g.className = "gleiter"; g.setAttribute("aria-hidden", "true");
  g.style.setProperty("--i", altIndex >= 0 ? altIndex : jetzt);
  box.classList.add("gleitend"); box.style.setProperty("--n", knoepfe.length); box.prepend(g);
  vorher.set(schluessel, knoepfe[jetzt].dataset.k);
  // Erst nach dem Zeichnen an der alten Stelle zur neuen gleiten (sonst springt er)
  if (altIndex >= 0 && altIndex !== jetzt) setTimeout(() => { void g.getBoundingClientRect(); g.style.setProperty("--i", jetzt); }, 30);
  return box;
}

export function bewegungEinrichten() {
  document.addEventListener("touchstart", () => {}, { passive: true });
  document.addEventListener("click", e => {
    letzterTipp = { el: e.target, zeit: Date.now() };
    // Klappe wird gleich aufgehen → Inhalt weich einblenden
    const summary = e.target.closest?.("summary");
    if (summary && summary.parentElement?.tagName === "DETAILS" && !summary.parentElement.open && !e.target.closest(".info-knopf")) {
      const d = summary.parentElement;
      d.classList.add("klappt-auf"); setTimeout(() => d.classList.remove("klappt-auf"), 450);
    }
    // Auswahl-Knopf kurz aufploppen lassen
    const chip = e.target.closest?.(".chip");
    if (chip && !chip.closest(".umschalter")) { poppen(chip); letzterChip = { el: chip, text: chip.textContent, bis: Date.now() + 500 }; }
  }, true);
  // Viele Ansichten zeichnen sich nach dem Antippen neu (z. B. „Outfit finden“): Dann ist der angetippte Knopf ersetzt.
  // Kurz danach ploppt darum der neue Knopf mit demselben Text auf.
  new MutationObserver(() => {
    if (!letzterChip) return;
    if (Date.now() > letzterChip.bis) { letzterChip = null; return; }
    if (letzterChip.el.isConnected) return;
    const neu = [...document.querySelectorAll(".chip")].find(c => c.textContent === letzterChip.text && !c.closest(".umschalter"));
    if (neu) { poppen(neu); letzterChip = null; }
  }).observe(document.body, { childList: true, subtree: true });
}
let letzterChip = null; // { el, text, bis }: zuletzt angetippter Auswahl-Knopf (für das Neuzeichnen)
function poppen(k) {
  k.classList.remove("pop"); void k.offsetWidth; k.classList.add("pop");
  k.addEventListener("animationend", () => k.classList.remove("pop"), { once: true });
}

/* ---------- 6. Ruhig neu zeichnen ---------- */
// s = Zustand der Ansicht (beim Neuzeichnen derselbe, beim nächsten Öffnen ein neuer); jetzt = wie es nach dem Stand gerade wäre,
// z. B. { verkauf: true, verliehen: false }. Gilt das erste Mal, bis man die Ansicht verlässt.
export function festeAnordnung(s, jetzt) {
  if (!s.anordnung) s.anordnung = jetzt;
  return s.anordnung;
}
// Vor dem Neuzeichnen: Wo steht der Bereich (data-anker), in dem zuletzt getippt wurde? frisch = gerade eben getippt
// (bis 15 s, wegen Rückfragen wie „Doch behalten?“) → dann auch weich aufklappen und aufleuchten.
export function ankerMerken(box) {
  const t = letzterTipp;
  if (!t || Date.now() - t.zeit > 60000 || !box.contains(t.el)) return null;
  const a = t.el.closest?.("[data-anker]");
  if (!a) return null;
  const r = a.getBoundingClientRect();
  return { name: a.dataset.anker, oben: r.top, hoehe: r.height, frisch: Date.now() - t.zeit < 15000 };
}
// Nach dem Neuzeichnen: den Bereich wieder an dieselbe Stelle schieben (rahmen = der Bereich, der scrollt)
export function ankerHalten(box, anker, rahmen) {
  if (!anker) return;
  const neu = box.querySelector(`[data-anker="${anker.name}"]`);
  if (!neu) return;
  rahmen.scrollTop += neu.getBoundingClientRect().top - anker.oben;
  if (!anker.frisch || ruhig()) return;
  hoeheGleiten(neu, anker.hoehe);
  neu.classList.remove("leuchtet"); void neu.offsetWidth; neu.classList.add("leuchtet");
  const weg = e => { if (e.target === neu && e.animationName === "leuchten") { neu.classList.remove("leuchtet"); neu.removeEventListener("animationend", weg); } };
  neu.addEventListener("animationend", weg);
}
// Höhe weich von „von“ auf die jetzige bringen; der Inhalt wird so lange am Rand abgeschnitten
function hoeheGleiten(e, von) {
  const bis = e.getBoundingClientRect().height;
  if (!von || Math.abs(bis - von) < 2) return;
  e.style.overflow = "hidden";
  const a = e.animate([{ height: von + "px" }, { height: bis + "px" }], { duration: 300, easing: "cubic-bezier(.3,.75,.25,1)" });
  a.onfinish = a.oncancel = () => { e.style.overflow = ""; };
}
// Die beim Neuzeichnen gehaltene Mindesthöhe der Ansicht freigeben. Ist die Seite kürzer geworden (z. B. „Doch behalten“ ganz unten),
// rückte sie sonst auf einen Schlag nach; so schrumpft sie weich. Die Höhe des Inhalts ergibt sich aus dem letzten Kind
// (unabhängig von der Mindesthöhe), damit die Seite nicht schon beim Messen kürzer wird.
export function mindestHoeheFrei(box) {
  const alt = parseFloat(box.style.minHeight);
  if (!alt) return;
  const letztes = box.lastElementChild;
  const inhalt = letztes ? Math.ceil(letztes.getBoundingClientRect().bottom - box.getBoundingClientRect().top) : 0;
  if (!ruhig() && inhalt && alt > inhalt + 2) box.animate([{ minHeight: alt + "px" }, { minHeight: inhalt + "px" }], { duration: 350, easing: "cubic-bezier(.3,.75,.25,1)" });
  box.style.minHeight = "";
}
// Inhalt eines Bereichs austauschen und die Höhe weich mitgehen lassen
export function weichAendern(e, aendern) {
  const von = e.isConnected ? e.getBoundingClientRect().height : 0;
  aendern();
  if (von && e.isConnected && !ruhig()) hoeheGleiten(e, von);
}
