// Rundtour über die Startseite (seit 0.36, Wunsch 23.11.2026): wie in vielen Apps beim ersten Öffnen – grob zeigen, wo was ist.
// Start über den Knopf „?“ oben rechts (mit Rückfrage). Beim allerersten Öffnen fragt die App einmal von selbst (Kästchen unter dem
// Umschalter); „Tour starten“ oder „Nein danke“ merkt sich das Gerät (localStorage, nur eine Einstellung, nicht in der Sicherung).
// Nur die Startseite, Kleidung und Haushalt; innen erklären die ⓘ-Knöpfe. Die Seite wird abgedunkelt, ein Knopf hell hervorgehoben,
// daneben eine Sprechblase. Unterwegs schaltet die Tour selbst zwischen Kleidung und Haushalt um und am Ende zurück.
// Nur feste Texte, alles per textContent.
import { el, fill } from "./ui.js?v=21";

const GESEHEN = "tourAngeboten";
const merken = () => { try { localStorage.setItem(GESEHEN, "1"); } catch { /* nur nicht gemerkt */ } };
const schonAngeboten = () => { try { return localStorage.getItem(GESEHEN) === "1"; } catch { return false; } };

// ziel() = das hervorgehobene Element (oder null: dann nur die Sprechblase in der Mitte), bereich = vorher dorthin umschalten
const STATIONEN = [
  { ziel: () => document.querySelector(".bereich-wahl"), titel: "Kleidung oder Haushalt",
    text: "Hier wechselst du zwischen deinem Kleiderschrank und den Sachen im Haushalt. Die App merkt sich, wo du zuletzt warst." },
  { bereich: "kleidung", ziel: () => document.getElementById("uploadLabel"), titel: "Kleidung hinzufügen",
    text: "Fotografiere ein Teil oder wähle Fotos aus. Die KI erkennt Art, Farbe und Muster, du korrigierst nur, was nicht stimmt. Jedes Teil bekommt eine feste Nummer." },
  { bereich: "kleidung", ziel: () => document.getElementById("outfitKnopf"), titel: "Outfit finden",
    text: "Sag, wofür du ein Outfit brauchst, z. B. Essen gehen bei 15 Grad. ChatGPT oder Gemini sieht deine Fotos und stellt Outfits zusammen, darunter stehen die Vorschläge der App." },
  { bereich: "kleidung", ziel: () => document.getElementById("schonKnopf"), titel: "Hab ich sowas schon?",
    text: "Im Laden ein Foto machen: Die App sagt dir, ob du schon etwas Ähnliches im Kleiderschrank hast." },
  { bereich: "kleidung", ziel: () => document.getElementById("kofferKnopf"), titel: "Koffer packen",
    text: "Reise eintragen (Tage, Wetter, was du vorhast), die App packt eine Liste aus deinem Kleiderschrank, mit einem Outfit pro Tag." },
  { bereich: "kleidung", ziel: () => document.querySelector("#kacheln .kachel"), titel: "Dein Kleiderschrank",
    text: "Hier liegen alle Teile, dazu eigene Ordner und deine fertigen Outfits. Tippst du ein Teil an, findest du „Was passt dazu?“, Verkaufen und Verleihen." },
  { bereich: "kleidung", ziel: () => document.querySelector("#nebenKacheln button"), titel: "Mein Stil",
    text: "Einmal einstellen, was du gern trägst und was lieber nicht. Die Vorschläge achten darauf, wenn du es dort einschaltest." },
  { bereich: "haushalt", ziel: () => document.querySelector("#startHaushalt .haupt"), titel: "Sachen im Haushalt",
    text: "Dinge fotografieren und kurz beschreiben, z. B. Bücher mit Autor und Titel. Getrennt von der Kleidung, mit eigenen Nummern (H001 …)." },
  { bereich: "haushalt", ziel: () => document.querySelectorAll("#startHaushalt .haupt")[1], titel: "Wunschliste und Umzugskisten",
    text: "Notiere, was du neu brauchst (die App sagt dir, ob du so etwas schon hast), oder pack Umzugskisten und sieh später, was in welcher Kiste ist." },
  { bereich: "haushalt", ziel: () => document.querySelectorAll("#startHaushalt .haupt")[3], titel: "Verkaufen",
    text: "Bei jedem Ding und jedem Kleidungsstück kannst du „Will ich verkaufen“ antippen. Die App schreibt dir den Text für Vinted, Kleinanzeigen oder eBay." },
  { ziel: () => document.querySelector("#gemeinsamKacheln button"), titel: "Sicherung – wichtig!",
    text: "Alles liegt nur auf diesem Handy. Speichere ab und zu eine Sicherung in der Dateien-App, sonst kann bei einem neuen Handy alles weg sein. Die App erinnert dich daran. Daneben erscheinen „Verkäufe“ und „Verliehen“, sobald es etwas gibt." },
  { ziel: () => document.getElementById("tourKnopf"), titel: "Fertig",
    text: "Mit dem „?“ startest du die Tour jederzeit wieder. In der App erklärt ein ⓘ neben vielen Feldern noch mehr." }
];

let aktiv = null; // { schritt, start, ende() }

// app = { bereich() (jetziger Bereich), zeigeBereich(b) (Promise), aufStart() (ist die Startseite zu sehen?) }
export function tourEinrichten(app) {
  const knopf = document.getElementById("tourKnopf");
  if (knopf) knopf.onclick = () => { if (confirm("Kurze Tour durch die App starten?\n\nSie zeigt dir in etwa einer Minute, wo was ist.")) tourStarten(app); };
  // Einmal von selbst fragen
  const angebot = document.getElementById("tourAngebot");
  if (!angebot || schonAngeboten()) return;
  const los = el("button", { type: "button", class: "btn primary" }, "Tour starten"), nein = el("button", { type: "button", class: "btn" }, "Nein danke");
  const weg = () => { merken(); angebot.hidden = true; fill(angebot); };
  los.onclick = () => { weg(); tourStarten(app); };
  nein.onclick = weg;
  fill(angebot, el("strong", {}, "👋 Kurze Tour durch die App?"),
    el("p", { class: "hint" }, "Sie zeigt dir in etwa einer Minute, wo was ist. Später startest du sie jederzeit mit dem „?“ oben rechts."),
    el("div", { class: "actions" }, nein, los));
  angebot.hidden = false;
}

export async function tourStarten(app) {
  if (aktiv || !app.aufStart()) return;
  merken();
  document.getElementById("tourAngebot")?.setAttribute("hidden", "");
  const start = app.bereich();
  const loch = el("div", { class: "tour-loch" });
  const titel = el("h3", {}), text = el("p", {}), zahl = el("span", { class: "tour-zahl" });
  const zurueck = el("button", { type: "button", class: "btn" }, "Zurück"), weiter = el("button", { type: "button", class: "btn primary" }, "Weiter");
  const beenden = el("button", { type: "button", class: "tour-beenden", "aria-label": "Tour beenden" }, "Beenden");
  const blase = el("div", { class: "tour-blase", role: "dialog", "aria-live": "polite" }, el("div", { class: "tour-kopf" }, titel, beenden), text,
    el("div", { class: "tour-fuss" }, zahl, zurueck, weiter));
  const huelle = el("div", { class: "tour" }, loch, blase);
  document.body.append(huelle);
  let ziel = null;

  function platzieren() {
    const rand = 12, vh = window.innerHeight, oben = 52; // oben: Platz für Uhrzeit und Statusleiste
    if (!ziel || !ziel.isConnected) { loch.hidden = true; huelle.classList.add("ohne-ziel"); blase.style.top = Math.max(oben, (vh - blase.offsetHeight) / 2) + "px"; return; }
    huelle.classList.remove("ohne-ziel"); loch.hidden = false;
    const r = ziel.getBoundingClientRect(), pad = 6;
    Object.assign(loch.style, { top: r.top - pad + "px", left: r.left - pad + "px", width: r.width + 2 * pad + "px", height: r.height + 2 * pad + "px" });
    const h = blase.offsetHeight;
    let top = r.bottom + pad + rand;                         // am liebsten darunter
    if (top + h > vh - rand) top = r.top - pad - rand - h;   // sonst darüber
    if (top < oben) top = Math.max(oben, vh - h - rand);     // sonst unten am Rand
    blase.style.top = top + "px";
  }
  async function zeigen(i) {
    if (!aktiv) return;
    aktiv.schritt = i;
    const s = STATIONEN[i];
    if (s.bereich && s.bereich !== app.bereich()) await app.zeigeBereich(s.bereich);
    if (!aktiv || aktiv.schritt !== i) return; // inzwischen beendet oder weitergetippt
    ziel = s.ziel() || null;
    titel.textContent = s.titel; text.textContent = s.text; zahl.textContent = `${i + 1} von ${STATIONEN.length}`;
    zurueck.hidden = i === 0; weiter.textContent = i === STATIONEN.length - 1 ? "Fertig" : "Weiter";
    // Hervorgehobenes in die Mitte holen (ohne sanftes Scrollen: das stockt auf manchen Handys)
    if (ziel) ziel.scrollIntoView({ block: "center" });
    requestAnimationFrame(platzieren);
    weiter.focus({ preventScroll: true });
  }
  const ende = async () => {
    window.removeEventListener("resize", platzieren); document.removeEventListener("keydown", tasten);
    huelle.remove(); aktiv = null;
    if (app.bereich() !== start) await app.zeigeBereich(start);
    document.getElementById("rahmen").scrollTop = 0;
  };
  const tasten = e => { if (e.key === "Escape") ende(); else if (e.key === "ArrowRight") weiter.click(); else if (e.key === "ArrowLeft" && !zurueck.hidden) zurueck.click(); };
  aktiv = { schritt: 0, ende };
  weiter.onclick = () => aktiv.schritt < STATIONEN.length - 1 ? zeigen(aktiv.schritt + 1) : ende();
  zurueck.onclick = () => { if (aktiv.schritt > 0) zeigen(aktiv.schritt - 1); };
  beenden.onclick = ende;
  window.addEventListener("resize", platzieren); document.addEventListener("keydown", tasten);
  await zeigen(0);
}
