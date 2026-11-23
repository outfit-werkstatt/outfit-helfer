// „💰 Verkaufen“ (seit 0.26, Wunsch 18.11.2026): ein Teil auf dem Weg zum Verkauf begleiten, mit Übersicht.
// Am Teil (und seit 0.32 am Ding im Haushalt): verkauf = "zumVerkauf" (will ich verkaufen) | "eingestellt" (liegt auf einer Plattform)
// | "verkauft"; sonst fehlt das Feld oder ist null.
// Dazu freiwillig: preis (Preis auf der Plattform, in €), erloes (wofür es verkauft wurde), eingestelltAm und verkauftAm (Zeitpunkte),
// seit 0.32 plattform (Wunsch 19.11.2026: Vinted, Kleinanzeigen, eBay als Knöpfe oder selbst eingetippt; vorher gab es nur Vinted,
// darum gilt „eingestellt“ ohne Plattform als Vinted) und kaufpreis (wofür sie es gekauft hat, für die Verkaufs-Übersicht).
// Ein Teil mit Verkaufs-Stand kommt in keine Vorschläge (App und Chat), wie „🚫 Ziehe ich nicht an“: Wer etwas loswerden will,
// soll es nicht wieder vorgeschlagen bekommen. Verkaufte Teile sind nicht mehr im Kleiderschrank, nur noch unter „✅ Verkauft“.
// Sie bleiben mit Nummer gespeichert (Nummern werden ohnehin nie neu vergeben) und kommen mit kleinem Foto in die Sicherung,
// damit die Übersicht erhalten bleibt. Die App schickt nichts an eine Plattform; Einstellen und Verkaufen macht sie selbst dort.
// Texte nur als Text (textContent/value), nie per innerHTML.
import { el, fill, toast, fehlerToast, field, choice, datumText, clean } from "./ui.js?v=21";
import { updateItem, nrText } from "./speicher.js?v=12";
import { weichAendern } from "./bewegung.js?v=2";

export const ZUM_VERKAUF = "zumVerkauf", EINGESTELLT = "eingestellt", VERKAUFT = "verkauft";
export const VERKAUF_STUFEN = [ZUM_VERKAUF, EINGESTELLT, VERKAUFT];
export const VERKAUF_NAME = "💰 Zum Verkaufen", VERKAUFT_NAME = "✅ Verkauft";
// Plattformen als Knöpfe (seit 0.32); andere tippt sie unter „Andere …“ selbst ein (eigener Knopf „Plattform“, wie bei den Merkmalen)
export const PLATTFORMEN = ["Vinted", "Kleinanzeigen", "eBay"];
export const MAX_PLATTFORM = 30;
export const plattformVon = t => t?.plattform || "Vinted";
// Ab so vielen Tagen online schlägt die App vor, den Preis zu senken (nur als Hinweis beim Öffnen, keine Mitteilung)
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
// 12 → „12 €“, 12.5 → „12,50 €“ (seit 0.32 mit festem Leerzeichen: sonst brach „192 €“ zwischen Zahl und € um)
export const preisText = n => typeof n === "number" && isFinite(n)
  ? n.toLocaleString("de-DE", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }) + " €" : "";
// Für die Sicherung: nur Zahlen in vernünftigen Grenzen, auf Cent gerundet
export const preisPruefen = v => typeof v === "number" && isFinite(v) && v >= 0 && v <= MAX_PREIS ? Math.round(v * 100) / 100 : null;
// Für die Sicherung: Plattform als kurzer Text (eigene Einträge erlaubt)
export const plattformPruefen = v => typeof v === "string" ? clean(v).slice(0, MAX_PLATTFORM) || null : null;

// Kurzer Stand unter einer Kachel: „💰 will ich verkaufen“, „📦 seit 6 Tagen bei Kleinanzeigen · 15 €“, „✅ 18.11.2026 · 12 €“
export function verkaufKurz(t) {
  if (t.verkauf === ZUM_VERKAUF) return "💰 will ich verkaufen";
  if (t.verkauf === EINGESTELLT) return [`📦 ${tageText(tageSeit(t.eingestelltAm))} bei ${plattformVon(t)}`, preisText(t.preis)].filter(Boolean).join(" · ");
  if (t.verkauf === VERKAUFT) return [`✅ ${t.verkauftAm ? datumText(t.verkauftAm) : "verkauft"}`, preisText(t.erloes)].filter(Boolean).join(" · ");
  return "";
}
// Zeichen auf dem Foto im Kleiderschrank
export const verkaufZeichen = t => t.verkauf === ZUM_VERKAUF ? "💰" : t.verkauf === EINGESTELLT ? "📦" : t.verkauf === VERKAUFT ? "✅" : null;

// Alles zurück auf „nicht verkaufen“ (die Felder bleiben im Teil, aber leer). Der Kaufpreis bleibt: Er gehört zum Teil, nicht zum Verkauf.
export const KEIN_VERKAUF = { verkauf: null, preis: null, erloes: null, eingestelltAm: null, verkauftAm: null, plattform: null };
const NICHTS = KEIN_VERKAUF;

// Feld „Verkaufen“ in der Teil-Ansicht, unter „🏷 Für Vinted“ und seit 0.32 beim Ding im Haushalt. Speichert sofort.
// nachher(teil) nach jeder Änderung (z. B. die ganze Ansicht neu zeichnen); ohne nachher zeichnet sich nur das Feld selbst neu.
// opt: speichern(nr, felder) (Standard: Teil im Kleiderschrank), name(nr) („Nr. 012“ / „H012“), ding (Texte für den Haushalt)
export function verkaufFeld(t, nachher = null, opt = {}) {
  const speichernIn = opt.speichern || updateItem, nameVon = opt.name || (n => `Nr. ${nrText(n)}`), ding = !!opt.ding;
  // Texte, die sich zwischen Kleiderschrank und Haushalt unterscheiden
  const W = ding
    ? { ordner: "Es kommt im Haushalt unter „💰 Zum Verkaufen“.", stand: "💰 Will ich verkaufen.", zurueck: "bleibt im Haushalt",
        weg: "nicht mehr im Haushalt, nur noch unter „✅ Verkauft“", wieder: "ist wieder im Haushalt", zurueckOrt: "Es kommt zurück in den Haushalt" }
    : { ordner: "Das Teil kommt in den Ordner „💰 Zum Verkaufen“ und nicht mehr in Outfit-Vorschläge.", stand: "💰 Will ich verkaufen. Kommt nicht in Vorschläge.",
        zurueck: "kommt wieder in Vorschläge", weg: "nicht mehr im Kleiderschrank und kommt nicht mehr in Vorschläge", wieder: "ist wieder im Kleiderschrank",
        zurueckOrt: "Das Teil kommt zurück in den Kleiderschrank" };
  let teil = { ...t };
  const box = el("div", { class: "verkauf-box" });
  let beschaeftigt = false, wahl = null;
  // neu = false: nur speichern, nichts neu zeichnen (beim Preis: das Feld zeigt ihn schon, und ein Neuzeichnen direkt nach dem
  // Verlassen des Felds würde den Knopf wegnehmen, den sie gerade antippt)
  async function setzen(felder, meldung, neu = true) {
    if (neu && beschaeftigt) return; // zweimal schnell getippt
    if (neu) beschaeftigt = true;
    try {
      await speichernIn(teil.nr, felder);
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
  // Plattform-Knöpfe (Vinted, Kleinanzeigen, eBay, „Andere …“ zum Eintippen). gewaehlt(name) beim Antippen.
  const plattformWahl = (aktuell, gewaehlt) => {
    wahl?.dispose();
    wahl = choice({ field: "Plattform", options: PLATTFORMEN, selected: aktuell ? [aktuell] : [], beispiel: "z. B. Momox", onChange: sel => { if (sel[0]) gewaehlt(sel[0]); } });
    return wahl.el;
  };
  const nr = () => nameVon(teil.nr);
  // „Gekauft für“ bei Kleidung in jedem Schritt (seit 0.33.2, Durchsicht 19.11.2026: vorher erst nach dem Verkauf). Im Haushalt steht
  // es schon bei den Angaben, darum dort nur beim Verkauften.
  const gekauftFeld = () => preisFeld(teil.kaufpreis, "Gekauft für (freiwillig)", n => setzen({ kaufpreis: n }, n == null ? "Kaufpreis entfernt" : `Gespeichert: ${preisText(n)}`, false));

  function zeichnen() {
    const s = teil.verkauf, bei = plattformVon(teil);
    wahl?.dispose(); wahl = null;
    if (!s) {
      fill(box, field("Verkaufen", null,
        el("div", {}, el("div", { class: "actions" }, knopf("💰 Will ich verkaufen", () => setzen({ ...NICHTS, verkauf: ZUM_VERKAUF }, `${nr()} liegt jetzt in „${VERKAUF_NAME}“`))),
          ding ? null : gekauftFeld()),
        [W.ordner, "Hast du es eingestellt (z. B. bei Vinted oder Kleinanzeigen), tippst du hier die Plattform an, und wenn es weg ist, „✅ Verkauft“. So behältst du den Überblick."]));
      return;
    }
    if (s === ZUM_VERKAUF) {
      fill(box, field("Verkaufen", W.stand,
        el("div", {},
          el("div", { class: "note" }, "Eingestellt? Tipp an, wo:"),
          plattformWahl(null, p => setzen({ verkauf: EINGESTELLT, eingestelltAm: new Date().toISOString(), plattform: p }, `Bei ${p} eingestellt – viel Erfolg beim Verkaufen!`)),
          el("div", { class: "actions wrap" }, knopf("Doch behalten", () => setzen(NICHTS, `${nr()} ${W.zurueck}`))),
          ding ? null : gekauftFeld())));
      return;
    }
    if (s === EINGESTELLT) {
      const tage = tageSeit(teil.eingestelltAm);
      const verkaufBox = el("div", {});
      const verkauftKnopf = knopf("✅ Verkauft", () => {
        // Wofür verkauft? Freiwillig, vorbelegt mit dem Preis auf der Plattform. „Speichern“ liest das Feld selbst
        // (auf dem iPhone verlässt man das Feld beim Tippen auf den Knopf nicht immer).
        const feld = preisFeld(teil.preis ?? null, "Verkauft für (freiwillig)", () => {});
        const ok = knopf("Speichern", () => {
          const n = preisLesen(feld.querySelector("input").value);
          if (n === undefined) return toast("Bitte nur einen Betrag eintippen, z. B. 12 oder 12,50");
          setzen({ verkauf: VERKAUFT, verkauftAm: new Date().toISOString(), erloes: n, plattform: bei }, `${nr()} ist verkauft 🎉 Du findest es unter „${VERKAUFT_NAME}“.`);
        }, true);
        // Frage weich auf- und zuklappen (seit 0.38)
        weichAendern(box, () => {
          fill(verkaufBox, el("div", { class: "verkauf-frage" }, feld,
            el("p", { class: "note" }, `Danach ist es ${W.weg}.`),
            el("div", { class: "actions" }, knopf("Abbrechen", () => weichAendern(box, () => { fill(verkaufBox); verkauftKnopf.hidden = false; })), ok)));
          verkauftKnopf.hidden = true;
        });
      }, true);
      const am = teil.eingestelltAm ? ` (eingestellt am ${datumText(teil.eingestelltAm)})` : "";
      // Plattform nachträglich ändern (z. B. falsch angetippt), eingeklappt, damit es ruhig bleibt
      const anders = el("details", { class: "plattform-anders" }, el("summary", {}, "Andere Plattform?"),
        plattformWahl(bei, p => { if (p !== bei) setzen({ plattform: p }, `Gespeichert: bei ${p}`); }));
      fill(box, field("Verkaufen", tage === 0 ? `📦 Heute bei ${bei} eingestellt.` : `📦 ${tage === 1 ? "Seit gestern" : `Seit ${tage} Tagen`} bei ${bei}${am}.`,
        el("div", {},
          langeOnline(teil) ? el("p", { class: "hint" }, `⏰ Schon über ${LANGE_TAGE} Tage online. Vielleicht den Preis bei ${bei} etwas senken?`) : null,
          preisFeld(teil.preis, "Preis (freiwillig)", n => setzen({ preis: n }, n == null ? "Preis entfernt" : `Preis: ${preisText(n)}`, false)),
          ding ? null : gekauftFeld(),
          el("div", { class: "actions wrap" }, verkauftKnopf,
            // Rückfrage, weil Preis und Datum verloren gehen (Durchsicht vor dem Hochladen, 18.11.2026)
            knopf("Doch behalten", () => {
              if (!confirm(`Doch behalten?\n\nDer Preis und das Datum bei ${bei} werden gelöscht${ding ? "" : ", das Teil kommt wieder in Vorschläge"}. Nimm es auch bei ${bei} heraus.`)) return;
              setzen(NICHTS, `${nr()} ${W.zurueck}. Nimm es auch bei ${bei} heraus.`);
            })),
          verkaufBox, anders)));
      return;
    }
    // Verkauft: Betrag und (seit 0.32) wofür gekauft, beides für die Verkaufs-Übersicht
    fill(box, field("Verkaufen", `✅ Verkauft${teil.verkauftAm ? " am " + datumText(teil.verkauftAm) : ""} über ${bei}.`,
      el("div", {},
        preisFeld(teil.erloes, "Verkauft für (freiwillig)", n => setzen({ erloes: n }, n == null ? "Betrag entfernt" : `Gespeichert: ${preisText(n)}`, false)),
        gekauftFeld(),
        el("div", { class: "actions" }, knopf("Doch nicht verkauft", () => {
          if (!confirm(`Doch nicht verkauft?\n\n${W.zurueckOrt} (unter „💰 Zum Verkaufen“). Verkaufsdatum und Betrag werden gelöscht.`)) return;
          setzen({ verkauf: EINGESTELLT, verkauftAm: null, erloes: null, eingestelltAm: teil.eingestelltAm || new Date().toISOString() },
            `${nr()} ${W.wieder} (bei ${bei} eingestellt)`);
        }))),
      [`Zum Beispiel, wenn der Kauf abgebrochen wurde. ${W.zurueckOrt}, unter „💰 Zum Verkaufen“.`,
        "„Gekauft für“ zeigt dir in der Verkaufs-Übersicht, wie viel du zurückbekommen hast."]));
  }
  zeichnen();
  return box;
}
