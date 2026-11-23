// Kleine Bewegungen, damit sich die App beim Tippen „echter“ anfühlt (seit 0.37, Wunsch 23.11.2026: „Haptik schöner gestalten“).
// 1. Drück-Effekt: Knöpfe, Kacheln und Fotos werden beim Antippen kurz etwas kleiner (app.css :active). Safari auf dem iPhone
//    zeigt :active nur, wenn die Seite auf Berührungen hört – darum ein leerer touchstart-Zuhörer.
// 2. Gleiten: Umschalter wie „♻️ Aussortiert“ und im Haushalt bekommen einen rosa Hintergrund, der zur gewählten Seite gleitet
//    (gleiten()). Die Ansicht wird beim Umschalten neu gezeichnet; darum startet der Hintergrund an der alten Stelle und gleitet
//    dann zur neuen.
// 4. Klappen: Tippt man eine Überschrift zum Aufklappen an, blendet der Inhalt weich ein (nur beim Antippen, nicht bei jedem
//    Neuzeichnen einer schon offenen Klappe).
// 5. Pop: Ein angetippter Auswahl-Knopf ploppt kurz auf (app.css .pop).
// Wer im iPhone „Bewegung reduzieren“ eingeschaltet hat, bekommt das alles ohne Animation (app.css).

const vorher = new Map(); // Umschalter → zuletzt gewählter Schlüssel (data-k des Knopfs)

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
