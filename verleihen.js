// „🤝 Verliehen“ (seit 0.34, Wunsch 23.11.2026): verleihen mit „Verliehen am“, freiwilligem „Zurück bis“ und „Zurückbekommen am“,
// für Kleidung UND Haushalt. Vorher (0.32) nur im Haushalt, und „Zurückbekommen“ löschte den Eintrag ohne Spur.
// Am Teil bzw. Ding: verliehen = { an, seit, bis } (bis = null, wenn nicht angegeben),
//                    verleihVerlauf = [{ an, seit, zurueck }] (neueste zuerst, höchstens 20).
// Verliehene Kleidung kommt in keine Vorschläge und keinen Koffer (regeln.js kandidaten); der Chat erfährt es über
// „Nur die Änderungen“ als „gerade verliehen“ bzw. „wieder da“ (chatgpt.js), ohne dass Fotos neu hochgeladen werden müssen.
// Namen sind eingetippt: nur per textContent/value, nie per innerHTML.
import { el, fill, toast, fehlerToast, field, clean, datumText } from "./ui.js?v=21";
import { weichAendern } from "./bewegung.js?v=2";

export const MAX_AN = 40, MAX_VERLAUF = 20;
const TAG = 24 * 3600 * 1000;

/* ---------- Datum ---------- */
// <input type="date"> arbeitet mit „JJJJ-MM-TT“. Gespeichert wird mittags Ortszeit, damit keine Zeitzone den Tag verschiebt.
const zwei = n => String(n).padStart(2, "0");
export const datumWert = (iso = null) => { const d = iso ? new Date(iso) : new Date(); return `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`; };
function isoVon(wert) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(wert || "");
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], 12);
  return isNaN(d) || d.getFullYear() < 1900 || d.getFullYear() > 2200 ? null : d.toISOString();
}
const tag0 = x => new Date(x).setHours(0, 0, 0, 0);
const tageZwischen = (a, b) => Math.round((tag0(b) - tag0(a)) / TAG);
const tage = n => n === 1 ? "1 Tag" : `${n} Tagen`;
export const seitText = iso => { const n = Math.max(0, tageZwischen(iso, Date.now())); return n === 0 ? "seit heute" : n === 1 ? "seit gestern" : `seit ${n} Tagen`; };
// Wie viele Tage „Zurück bis“ vorbei ist (0 = nicht überfällig oder kein Datum)
export const ueberfaellig = v => v?.bis ? Math.max(0, tageZwischen(v.bis, Date.now())) : 0;
function bisText(v) {
  if (!v?.bis) return null;
  const n = tageZwischen(Date.now(), v.bis);
  return n < 0 ? `⏰ ${-n === 1 ? "1 Tag" : -n + " Tage"} überfällig` : n === 0 ? "⏰ heute zurück" : n === 1 ? "zurück bis morgen" : `zurück bis ${datumText(v.bis)}`;
}
// Eine Zeile für Kacheln und Listen: „🤝 an Lena, seit 3 Tagen · zurück bis 30.11.2026“
export const verliehenKurz = x => x?.verliehen ? [`🤝 an ${x.verliehen.an}, ${seitText(x.verliehen.seit)}`, bisText(x.verliehen)].filter(Boolean).join(" · ") : null;

/* ---------- Prüfen (Sicherung laden) ----------
   Die Datei kann von irgendwoher stammen: nur bekannte Felder, Namen gekürzt, Daten als Datum, sonst weg. */
const textVon = (v, max) => typeof v === "string" ? clean(v).slice(0, max).trim() || null : null;
const zeitVon = v => typeof v === "string" && v.length < 40 && !isNaN(Date.parse(v)) ? new Date(v).toISOString() : null;
export function verliehenPruefen(v) {
  if (!v || typeof v !== "object") return null;
  const an = textVon(v.an, MAX_AN);
  if (!an) return null;
  const seit = zeitVon(v.seit) || new Date().toISOString(), bis = zeitVon(v.bis);
  return { an, seit, bis: bis && tag0(bis) >= tag0(seit) ? bis : null };
}
export function verlaufPruefen(liste) {
  if (!Array.isArray(liste)) return [];
  return liste.slice(0, MAX_VERLAUF).map(x => {
    const an = textVon(x?.an, MAX_AN), seit = zeitVon(x?.seit), zurueck = zeitVon(x?.zurueck);
    return an && seit && zurueck ? { an, seit, zurueck } : null;
  }).filter(Boolean);
}

/* ---------- Feld beim Teil bzw. Ding ----------
   x = Teil oder Ding; speichern(felder) speichert sofort am Teil/Ding; name = „Nr. 012“ bzw. „H005“ für die Meldungen;
   neuZeichnen() nach dem Speichern. Gibt ein Panel zurück.
   Seit 0.38: Das Panel ist ein „Anker“ (bleibt nach dem Speichern an seiner Stelle, bewegung.js), und Formular auf/zu geht weich. */
export function verleihFeld(x, { speichern, name, neuZeichnen }) {
  const kasten = el("div", {}), verlauf = verlaufPruefen(x.verleihVerlauf);
  const panel = el("div", { class: "panel", "data-anker": "verleih" }, kasten);
  const fuellen = (...teile) => weichAendern(panel, () => fill(kasten, ...teile));
  const datumFeld = (wert, label) => el("input", { type: "date", class: "feld-eingabe datum-eingabe", value: wert || "", "aria-label": label });
  const abbrechen = () => el("button", { type: "button", class: "btn", onclick: zeigen }, "Abbrechen");
  const speichereMit = async (knopf, felder, text) => {
    knopf.disabled = true;
    try { await speichern(felder); toast(text); neuZeichnen(); }
    catch (e) { knopf.disabled = false; fehlerToast("Speichern hat nicht geklappt", e); }
  };
  // Verleihen (v = null) oder einen bestehenden Eintrag ändern
  function formular(v = null) {
    const an = el("input", { type: "text", class: "feld-eingabe", maxLength: MAX_AN, value: v?.an || "", placeholder: "z. B. Nachbarin, Lena",
      autocomplete: "off", enterKeyHint: "done", "aria-label": "An wen verliehen" });
    an.onkeydown = e => { if (e.key === "Enter") an.blur(); };
    const am = datumFeld(datumWert(v?.seit), "Verliehen am"), bis = datumFeld(v?.bis ? datumWert(v.bis) : "", "Zurück bis");
    const msg = el("p", { class: "hint" }), ok = el("button", { type: "button", class: "btn primary" }, "Speichern");
    ok.onclick = () => {
      const wer = clean(an.value).slice(0, MAX_AN), seit = isoVon(am.value), zurueck = bis.value ? isoVon(bis.value) : null;
      if (!wer) { msg.textContent = "Bitte eintippen, an wen."; return; }
      if (!seit) { msg.textContent = "Bitte den Tag wählen, an dem du es verliehen hast."; return; }
      if (bis.value && !zurueck) { msg.textContent = "Bei „Zurück bis“ bitte ein Datum wählen (oder leer lassen)."; return; }
      if (zurueck && tag0(zurueck) < tag0(seit)) { msg.textContent = "„Zurück bis“ liegt vor dem Tag, an dem du es verliehen hast."; return; }
      speichereMit(ok, { verliehen: { an: wer, seit, bis: zurueck } }, v ? "Gespeichert" : `An ${wer} verliehen`);
    };
    fuellen(el("strong", {}, v ? "🤝 Verleihen ändern" : "🤝 Verleihen"),
      field("An wen?", "Der Name bleibt nur auf deinem Handy (und in deiner Sicherung).", an),
      field("Verliehen am", null, am),
      field("Zurück bis", "freiwillig – ist der Tag vorbei, zeigt die App ⏰", bis),
      msg, el("div", { class: "actions" }, abbrechen(), ok));
    if (!v) an.focus();
  }
  function zurueckFormular() {
    const v = x.verliehen, am = datumFeld(datumWert(), "Zurückbekommen am");
    const msg = el("p", { class: "hint" }), ok = el("button", { type: "button", class: "btn primary" }, "Speichern");
    ok.onclick = () => {
      const zurueck = isoVon(am.value);
      if (!zurueck) { msg.textContent = "Bitte den Tag wählen, an dem du es zurückbekommen hast."; return; }
      if (tag0(zurueck) < tag0(v.seit)) { msg.textContent = "Das liegt vor dem Tag, an dem du es verliehen hast."; return; }
      speichereMit(ok, { verliehen: null, verleihVerlauf: [{ an: v.an, seit: v.seit, zurueck }, ...verlauf].slice(0, MAX_VERLAUF) }, `${name} ist wieder da`);
    };
    fuellen(el("strong", {}, "✓ Zurückbekommen"), field("Zurückbekommen am", `Von ${v.an}`, am), msg, el("div", { class: "actions" }, abbrechen(), ok));
  }
  function zeigen() {
    const v = x.verliehen;
    const frueher = verlauf.length ? el("details", { class: "mehr" }, el("summary", {}, `Früher verliehen (${verlauf.length})`),
      el("ul", { class: "verleih-verlauf" }, ...verlauf.map(h => el("li", {}, `An ${h.an}: ${datumText(h.seit)} – ${datumText(h.zurueck)}`)))) : null;
    if (!v) {
      fuellen(el("div", { class: "actions" }, el("button", { type: "button", class: "btn", onclick: () => formular() }, "🤝 Verleihen …")), frueher);
      return;
    }
    const n = ueberfaellig(v);
    fuellen(el("strong", {}, "🤝 Verliehen"),
      el("p", {}, `An ${v.an} am ${datumText(v.seit)} (${seitText(v.seit)}).`),
      v.bis ? el("p", { class: n ? "ueberfaellig" : "hint" }, n ? `⏰ Sollte am ${datumText(v.bis)} zurück sein – seit ${tage(n)} überfällig.` : `Zurück bis ${datumText(v.bis)}.`) : null,
      el("div", { class: "actions wrap" }, el("button", { type: "button", class: "btn", onclick: () => formular(v) }, "Ändern"),
        el("button", { type: "button", class: "btn primary", onclick: zurueckFormular }, "✓ Zurückbekommen")),
      frueher);
  }
  zeigen();
  return panel;
}

/* ---------- Übersicht „🤝 Verliehen“ (Kleidung und Haushalt zusammen) ----------
   eintraege = [{ art: "teil" | "ding", nr, titel, t }] (baut schrank.js), nur was gerade verliehen ist.
   Überfälliges zuerst, dann was als Nächstes zurückkommen soll, dann das am längsten Verliehene. */
const reihe = x => [-ueberfaellig(x.t.verliehen), x.t.verliehen.bis ? tag0(x.t.verliehen.bis) : Infinity, tag0(x.t.verliehen.seit)];
export function verliehenSortiert(eintraege) {
  return [...eintraege].sort((a, b) => { const ra = reihe(a), rb = reihe(b); return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2]; });
}
// Für die Kachel auf der Startseite: „2 verliehen · 1 überfällig“
export function verliehenStand(eintraege) {
  const n = eintraege.filter(x => ueberfaellig(x.t.verliehen)).length;
  return `${eintraege.length} verliehen${n ? ` · ${n} überfällig` : ""}`;
}
export function renderVerliehen(box, kopf, eintraege, bild, oeffnen) {
  const zeile = x => el("button", { type: "button", class: "verkauf-zeile", onclick: () => oeffnen(x) },
    el("img", { src: bild(x.t.vorschau), alt: "", loading: "lazy" }),
    el("span", {}, el("span", { class: "name" }, x.titel), el("span", { class: ueberfaellig(x.t.verliehen) ? "unter ueberfaellig" : "unter" }, verliehenKurz(x.t))));
  const teile = verliehenSortiert(eintraege.filter(x => x.art === "teil")), dinge = verliehenSortiert(eintraege.filter(x => x.art === "ding"));
  fill(box, kopf,
    !eintraege.length ? el("p", { class: "hint" }, "Gerade ist nichts verliehen. Verleihen kannst du bei jedem Teil und jedem Ding mit „🤝 Verleihen …“.") : null,
    teile.length ? el("div", { class: "panel" }, el("strong", {}, `Kleidung (${teile.length})`), ...teile.map(zeile)) : null,
    dinge.length ? el("div", { class: "panel" }, el("strong", {}, `Haushalt (${dinge.length})`), ...dinge.map(zeile)) : null,
    eintraege.length ? el("p", { class: "hint" }, "Verliehene Kleidung kommt in keine Outfit-Vorschläge und in keinen Koffer, bis du „✓ Zurückbekommen“ tippst.") : null);
}
