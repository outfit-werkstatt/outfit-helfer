// „💰 Verkaufen“ (seit 0.26, Wunsch 18.11.2026): ein Teil auf dem Weg zu Vinted begleiten, mit Übersicht.
// Am Teil: verkauf = "zumVerkauf" (will ich verkaufen) | "eingestellt" (liegt bei Vinted) | "verkauft"; sonst fehlt das Feld oder ist null.
// Dazu freiwillig: preis (Preis bei Vinted, in €), erloes (wofür es verkauft wurde), eingestelltAm und verkauftAm (Zeitpunkte).
// Ein Teil mit Verkaufs-Stand kommt in keine Vorschläge (App und Chat), wie „🚫 Ziehe ich nicht an“: Wer etwas loswerden will,
// soll es nicht wieder vorgeschlagen bekommen. Verkaufte Teile sind nicht mehr im Kleiderschrank, nur noch unter „✅ Verkauft“.
// Sie bleiben mit Nummer gespeichert (Nummern werden ohnehin nie neu vergeben) und kommen mit kleinem Foto in die Sicherung,
// damit die Übersicht erhalten bleibt. Die App schickt nichts an Vinted; Einstellen und Verkaufen macht sie selbst in der Vinted-App.
// Texte nur als Text (textContent/value), nie per innerHTML.
import { el, fill, toast, fehlerToast, field, datumText } from "./ui.js?v=21";
import { updateItem, nrText } from "./speicher.js?v=12";

export const ZUM_VERKAUF = "zumVerkauf", EINGESTELLT = "eingestellt", VERKAUFT = "verkauft";
export const VERKAUF_STUFEN = [ZUM_VERKAUF, EINGESTELLT, VERKAUFT];
export const VERKAUF_NAME = "💰 Zum Verkaufen", VERKAUFT_NAME = "✅ Verkauft";
// Ab so vielen Tagen bei Vinted schlägt die App vor, den Preis zu senken (nur als Hinweis beim Öffnen, keine Mitteilung)
export const LANGE_TAGE = 30;
export const MAX_PREIS = 99999;
const TAG = 24 * 3600 * 1000;

export const istVerkauft = t => t?.verkauf === VERKAUFT;
export const imVerkauf = t => t?.verkauf === ZUM_VERKAUF || t?.verkauf === EINGESTELLT;
// Im Kleiderschrank: nicht im Papierkorb und nicht verkauft (zum Verkaufen gehört es ihr ja noch)
export const imSchrank = t => !t.geloescht && !istVerkauft(t);

// Ganze Tage seit einem Zeitpunkt, nach Kalendertagen (gestern Abend = 1 Tag)
const tagAnfang = d => new Date(d).setHours(0, 0, 0, 0);
export const tageSeit = iso => iso ? Math.max(0, Math.round((tagAnfang(Date.now()) - tagAnfang(iso)) / TAG)) : 0;
const tageText = n => n === 0 ? "heute" : n === 1 ? "seit gestern" : `seit ${n} Tagen`;
export const langeOnline = t => t.verkauf === EINGESTELLT && tageSeit(t.eingestelltAm) >= LANGE_TAGE;

// „12“, „12,50“, „12.5 €“ → 12 / 12.5; leer → null; unbrauchbar → undefined
export function preisLesen(s) {
  const roh = String(s ?? "").replace(/€|eur(o)?/gi, "").replace(/\s/g, "");
  if (!roh) return null;
  if (!/^\d{1,5}([.,]\d{1,2})?$/.test(roh)) return undefined;
  const n = Math.round(Number(roh.replace(",", ".")) * 100) / 100;
  return n >= 0 && n <= MAX_PREIS ? n : undefined;
}
// 12 → „12 €“, 12.5 → „12,50 €“
export const preisText = n => typeof n === "number" && isFinite(n)
  ? n.toLocaleString("de-DE", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }) + " €" : "";
// Für die Sicherung: nur Zahlen in vernünftigen Grenzen, auf Cent gerundet
export const preisPruefen = v => typeof v === "number" && isFinite(v) && v >= 0 && v <= MAX_PREIS ? Math.round(v * 100) / 100 : null;

// Kurzer Stand unter einer Kachel: „💰 will ich verkaufen“, „📦 seit 6 Tagen bei Vinted · 15 €“, „✅ 18.11.2026 · 12 €“
export function verkaufKurz(t) {
  if (t.verkauf === ZUM_VERKAUF) return "💰 will ich verkaufen";
  if (t.verkauf === EINGESTELLT) return [`📦 ${tageText(tageSeit(t.eingestelltAm))} bei Vinted`, preisText(t.preis)].filter(Boolean).join(" · ");
  if (t.verkauf === VERKAUFT) return [`✅ ${t.verkauftAm ? datumText(t.verkauftAm) : "verkauft"}`, preisText(t.erloes)].filter(Boolean).join(" · ");
  return "";
}
// Zeichen auf dem Foto im Kleiderschrank
export const verkaufZeichen = t => t.verkauf === ZUM_VERKAUF ? "💰" : t.verkauf === EINGESTELLT ? "📦" : t.verkauf === VERKAUFT ? "✅" : null;

// Alles zurück auf „nicht verkaufen“ (die Felder bleiben im Teil, aber leer)
export const KEIN_VERKAUF = { verkauf: null, preis: null, erloes: null, eingestelltAm: null, verkauftAm: null };
const NICHTS = KEIN_VERKAUF;

// Feld „Verkaufen“ in der Teil-Ansicht und unter „🏷 Für Vinted“. Speichert sofort. nachher(teil) nach jeder Änderung
// (z. B. die ganze Ansicht neu zeichnen); ohne nachher zeichnet sich nur das Feld selbst neu.
export function verkaufFeld(t, nachher = null) {
  let teil = { ...t };
  const box = el("div", { class: "verkauf-box" });
  let beschaeftigt = false;
  // neu = false: nur speichern, nichts neu zeichnen (beim Preis: das Feld zeigt ihn schon, und ein Neuzeichnen direkt nach dem
  // Verlassen des Felds würde den Knopf wegnehmen, den sie gerade antippt)
  async function setzen(felder, meldung, neu = true) {
    if (neu && beschaeftigt) return; // zweimal schnell getippt
    if (neu) beschaeftigt = true;
    try {
      await updateItem(teil.nr, felder);
      teil = { ...teil, ...felder };
      toast(meldung);
      if (neu) { if (nachher) nachher(teil); else zeichnen(); }
      return true;
    } catch (e) { fehlerToast("Speichern hat nicht geklappt", e); return false; }
    finally { if (neu) beschaeftigt = false; }
  }
  const knopf = (text, onclick, haupt = false) => el("button", { type: "button", class: haupt ? "btn primary" : "btn", onclick }, text);
  // Eingabefeld für einen Preis; speichern(n) beim Verlassen des Felds oder mit der Eingabetaste
  function preisFeld(wert, beschriftung, speichern) {
    const alsText = n => n == null ? "" : Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ","); // 12,5 → „12,50“
    let aktuell = wert ?? null;
    const input = el("input", { type: "text", class: "feld-eingabe preis-eingabe", inputMode: "decimal", maxLength: 10, autocomplete: "off",
      enterKeyHint: "done", placeholder: "z. B. 12", value: alsText(aktuell), "aria-label": beschriftung });
    input.onkeydown = e => { if (e.key === "Enter") input.blur(); };
    input.onchange = async () => {
      const n = preisLesen(input.value);
      if (n === undefined) { toast("Bitte nur einen Betrag eintippen, z. B. 12 oder 12,50"); input.value = alsText(aktuell); return; }
      if (n === aktuell) return;
      const vorher = aktuell; aktuell = n;
      if (await speichern(n) === false) { aktuell = vorher; input.value = alsText(vorher); }
    };
    return el("label", { class: "preis-zeile" }, el("span", {}, beschriftung), el("span", { class: "preis-feld" }, input, el("span", {}, "€")));
  }
  const nr = () => `Nr. ${nrText(teil.nr)}`;

  function zeichnen() {
    const s = teil.verkauf;
    if (!s) {
      fill(box, field("Verkaufen", null,
        el("div", { class: "actions" }, knopf("💰 Will ich verkaufen", () => setzen({ ...NICHTS, verkauf: ZUM_VERKAUF }, `${nr()} liegt jetzt in „${VERKAUF_NAME}“`))),
        ["Das Teil kommt in den Ordner „💰 Zum Verkaufen“ und nicht mehr in Outfit-Vorschläge.",
         "Hast du es bei Vinted eingestellt, tippst du hier „📦 Bei Vinted eingestellt“, und wenn es weg ist, „✅ Verkauft“. So behältst du den Überblick."]));
      return;
    }
    if (s === ZUM_VERKAUF) {
      fill(box, field("Verkaufen", "💰 Will ich verkaufen. Kommt nicht in Vorschläge.",
        el("div", { class: "actions wrap" },
          knopf("📦 Bei Vinted eingestellt", () => setzen({ verkauf: EINGESTELLT, eingestelltAm: new Date().toISOString() }, "Eingestellt – viel Erfolg beim Verkaufen!"), true),
          knopf("Doch behalten", () => setzen(NICHTS, `${nr()} kommt wieder in Vorschläge`)))));
      return;
    }
    if (s === EINGESTELLT) {
      const tage = tageSeit(teil.eingestelltAm);
      const verkaufBox = el("div", {});
      const verkauftKnopf = knopf("✅ Verkauft", () => {
        // Wofür verkauft? Freiwillig, vorbelegt mit dem Preis bei Vinted. „Speichern“ liest das Feld selbst
        // (auf dem iPhone verlässt man das Feld beim Tippen auf den Knopf nicht immer).
        const feld = preisFeld(teil.preis ?? null, "Verkauft für (freiwillig)", () => {});
        const ok = knopf("Speichern", () => {
          const n = preisLesen(feld.querySelector("input").value);
          if (n === undefined) return toast("Bitte nur einen Betrag eintippen, z. B. 12 oder 12,50");
          setzen({ verkauf: VERKAUFT, verkauftAm: new Date().toISOString(), erloes: n }, `${nr()} ist verkauft 🎉 Du findest es unter „${VERKAUFT_NAME}“.`);
        }, true);
        fill(verkaufBox, el("div", { class: "verkauf-frage" }, feld,
          el("p", { class: "note" }, "Danach ist es nicht mehr im Kleiderschrank und kommt nicht mehr in Vorschläge."),
          el("div", { class: "actions" }, knopf("Abbrechen", () => { fill(verkaufBox); verkauftKnopf.hidden = false; }), ok)));
        verkauftKnopf.hidden = true;
      }, true);
      const am = teil.eingestelltAm ? ` (eingestellt am ${datumText(teil.eingestelltAm)})` : "";
      fill(box, field("Verkaufen", tage === 0 ? "📦 Heute bei Vinted eingestellt." : `📦 ${tage === 1 ? "Seit gestern" : `Seit ${tage} Tagen`} bei Vinted${am}.`,
        el("div", {},
          langeOnline(teil) ? el("p", { class: "hint" }, `⏰ Schon über ${LANGE_TAGE} Tage online. Vielleicht den Preis bei Vinted etwas senken?`) : null,
          preisFeld(teil.preis, "Preis bei Vinted (freiwillig)", n => setzen({ preis: n }, n == null ? "Preis entfernt" : `Preis: ${preisText(n)}`, false)),
          el("div", { class: "actions wrap" }, verkauftKnopf,
            // Rückfrage, weil Preis und Datum verloren gehen (Durchsicht vor dem Hochladen, 18.11.2026)
            knopf("Doch behalten", () => {
              if (!confirm("Doch behalten?\n\nDer Preis und das Datum bei Vinted werden gelöscht, das Teil kommt wieder in Vorschläge. Nimm es auch bei Vinted heraus.")) return;
              setzen(NICHTS, `${nr()} kommt wieder in Vorschläge. Nimm es auch bei Vinted heraus.`);
            })),
          verkaufBox)));
      return;
    }
    // Verkauft
    fill(box, field("Verkaufen", `✅ Verkauft${teil.verkauftAm ? " am " + datumText(teil.verkauftAm) : ""}.`,
      el("div", {},
        preisFeld(teil.erloes, "Verkauft für (freiwillig)", n => setzen({ erloes: n }, n == null ? "Betrag entfernt" : `Gespeichert: ${preisText(n)}`, false)),
        el("div", { class: "actions" }, knopf("Doch nicht verkauft", () => {
          if (!confirm("Doch nicht verkauft?\n\nDas Teil kommt zurück in den Kleiderschrank (unter „💰 Zum Verkaufen“). Verkaufsdatum und Betrag werden gelöscht.")) return;
          setzen({ verkauf: EINGESTELLT, verkauftAm: null, erloes: null, eingestelltAm: teil.eingestelltAm || new Date().toISOString() },
            `${nr()} ist wieder im Kleiderschrank (bei Vinted eingestellt)`);
        }))),
      "Zum Beispiel, wenn der Kauf abgebrochen wurde. Das Teil kommt dann zurück in den Kleiderschrank, unter „💰 Zum Verkaufen“."));
  }
  zeichnen();
  return box;
}
