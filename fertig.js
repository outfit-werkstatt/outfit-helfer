// „⭐ Fertige Outfits“ (Alis Wunsch 03.11.2026): gute Kombinationen aus den Vorschlägen der App oder aus der Antwort von
// ChatGPT/Gemini merken, auf Wunsch mit einem Foto vom fertigen Look (Bild aus dem Chat oder Spiegel-Selfie).
// Gespeichert werden nur Name, Nummern und Text; die Teile selbst bleiben im Kleiderschrank. Der Text aus dem Chat ist
// fremder Text: nur per textContent anzeigen. Das Foto wird wie alle Fotos neu gezeichnet und bleibt auf dem Gerät.
import { el, fill, toast, clean, cleanText, mitInfo, zeigeGross } from "./ui.js?v=15";
import { getOutfits, saveOutfit, deleteOutfit, getLookFoto, nrText } from "./speicher.js?v=10";
import { loadImage, alsJpg } from "./ki.js?v=7";

const MAX_NAME = 40, MAX_TEXT = 4000, MAX_TEILE = 12;
const datum = s => new Date(s).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
const schluessel = nrs => [...nrs].sort((a, b) => a - b).join(",");

// Knopf „⭐ Outfit speichern“ (unter den Vorschlägen der App und unter jedem Outfit aus der eingefügten Antwort).
// Dasselbe Outfit (gleiche Nummern) wird nicht doppelt gespeichert.
export function speichernKnopf(teile, name, text, quelle) {
  const knopf = el("button", { type: "button", class: "btn" }, "⭐ Outfit speichern");
  knopf.onclick = async () => {
    knopf.disabled = true;
    try {
      const nrs = [...new Set(teile.map(t => t.nr))].slice(0, MAX_TEILE), da = (await getOutfits()).find(o => schluessel(o.nrs) === schluessel(nrs));
      if (da) { knopf.textContent = "✓ Schon gespeichert"; toast(`Ist schon gespeichert als „${da.name}“`); return; }
      await saveOutfit({ id: "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: clean(name || "").slice(0, MAX_NAME) || "Outfit",
        nrs, text: text ? cleanText(text).slice(0, MAX_TEXT) || null : null, quelle, erstellt: new Date().toISOString(), foto: false });
      knopf.textContent = "✓ Gespeichert";
      toast("In „⭐ Fertige Outfits“ gespeichert");
    } catch (e) { knopf.disabled = false; toast("Speichern hat nicht geklappt: " + (e?.message || e)); console.error(e); }
  };
  return knopf;
}

// Kachel auf der Startseite: Vorschau der ersten Teile der neuesten Outfits
export function fertigKachel(outfits, items, bild, oeffnen) {
  const vorschau = outfits.slice(0, 4).map(o => items.find(t => t.nr === o.nrs[0] && !t.geloescht)).filter(Boolean);
  return el("button", { type: "button", class: "kachel", onclick: oeffnen },
    el("span", { class: vorschau.length === 1 ? "mosaik eins" : "mosaik" }, ...vorschau.map(t => el("img", { src: bild(t.vorschau), alt: "", loading: "lazy" }))),
    el("span", { class: "name" }, "⭐ Fertige Outfits"),
    el("span", { class: "anzahl" }, outfits.length === 1 ? "1 Outfit" : `${outfits.length} Outfits`));
}

// Liste aller fertigen Outfits. bild(blob) = Bild-Adresse (schrank.js gibt sie beim nächsten Zeichnen frei)
export function renderFertigListe(box, kopf, outfits, items, bild, oeffnen) {
  const nachNr = new Map(items.map(t => [t.nr, t]));
  const karte = o => {
    const look = el("span", { class: "look" }), teile = o.nrs.map(n => nachNr.get(n)).filter(Boolean);
    if (o.foto) getLookFoto(o.id, true).then(b => { if (b) fill(look, el("img", { src: bild(b), alt: "Foto vom Look" })); }).catch(e => console.error(e));
    return el("button", { type: "button", class: "outfit-karte", onclick: () => oeffnen(o.id) },
      look,
      el("span", { class: "outfit-info" },
        el("span", { class: "name" }, o.name),
        el("span", { class: "anzahl" }, `${o.nrs.length === 1 ? "1 Teil" : o.nrs.length + " Teile"} · ${datum(o.erstellt)}`),
        el("span", { class: "outfit-mini" }, ...teile.slice(0, 6).map(t => el("img", { src: bild(t.vorschau), alt: `Nr. ${nrText(t.nr)}`, loading: "lazy" })))));
  };
  fill(box, kopf,
    mitInfo(el("p", { class: "hint" }, outfits.length ? "Antippen zum Ansehen." : "Noch keine fertigen Outfits."),
      "Ein Outfit speicherst du mit „⭐ Outfit speichern“: bei den Vorschlägen der App oder unter einer eingefügten Antwort von ChatGPT oder Gemini.",
      "Gespeichert werden die Nummern der Teile, der Name und die Erklärung. Dazu kannst du ein Foto vom fertigen Look legen. Alles bleibt auf diesem Handy und kommt mit in deine Sicherung."),
    ...outfits.map(karte));
}

// Ein Foto vom Look aus einer Datei: neu zeichnen (groß und Vorschau), damit nur ein sauberes JPG gespeichert wird
async function lookAusDatei(datei) {
  const img = await loadImage(datei);
  try {
    const [gross, klein] = await Promise.all([alsJpg(img, 1200), alsJpg(img, 400)]);
    return { gross: await gross.arrayBuffer(), klein: await klein.arrayBuffer() };
  } finally { URL.revokeObjectURL(img.src); }
}

// Ein fertiges Outfit. kachel(t) = kleine Kachel eines Teils, paket(teile, wovon) = Bild-Paket-Bereich (chatgpt.js),
// zurueck() = zur Liste, neu() = diese Ansicht neu zeichnen
export function renderFertig(box, kopf, o, items, bild, kachel, paket, zurueck, neu) {
  const nachNr = new Map(items.map(t => [t.nr, t]));
  const teile = o.nrs.map(n => nachNr.get(n)).filter(t => t && !t.geloescht);
  const fehlt = o.nrs.filter(n => !nachNr.has(n)), imKorb = o.nrs.filter(n => nachNr.get(n)?.geloescht), nie = teile.filter(t => t.nichtAnziehen);

  // Foto vom Look
  const lookBox = el("div", {}), eingabe = el("input", { type: "file", accept: "image/*", hidden: true });
  eingabe.onchange = async () => {
    const datei = eingabe.files[0]; eingabe.value = "";
    if (!datei) return;
    try { await saveOutfit(o, await lookAusDatei(datei)); toast("Foto gespeichert"); neu(); }
    catch (e) { toast("Foto ging nicht: " + (e?.message || e)); console.error(e); }
  };
  const waehlen = el("label", { class: "btn datei" }, o.foto ? "📷 Foto ändern" : "📷 Foto vom Look hinzufügen", eingabe);
  const entfernen = el("button", { type: "button", class: "btn" }, "Foto entfernen");
  entfernen.onclick = async () => {
    if (!confirm("Foto vom Look entfernen? Das Outfit selbst bleibt.")) return;
    try { await saveOutfit(o, null); neu(); } catch (e) { toast("Hat nicht geklappt: " + (e?.message || e)); }
  };
  if (o.foto) getLookFoto(o.id).then(b => {
    if (!b) return;
    const u = bild(b), img = el("img", { src: u, alt: "Foto vom Look", class: "gross look-gross" });
    img.onclick = () => zeigeGross(u, "Foto vom Look");
    lookBox.prepend(img);
  }).catch(e => console.error(e));

  // Umbenennen
  const nameBox = el("div", {});
  const umbenennen = el("button", { type: "button", class: "btn" }, "Umbenennen");
  umbenennen.onclick = () => {
    const input = el("input", { type: "text", class: "suche", maxLength: MAX_NAME, value: o.name, "aria-label": "Name des Outfits", autocomplete: "off" });
    const ok = el("button", { type: "button", class: "btn primary" }, "Speichern");
    ok.onclick = async () => {
      const name = clean(input.value).slice(0, MAX_NAME);
      if (!name) { toast("Bitte einen Namen eintippen."); return; }
      try { await saveOutfit({ ...o, name }); toast("Gespeichert"); neu(); } catch (e) { toast("Hat nicht geklappt: " + (e?.message || e)); }
    };
    fill(nameBox, input, el("div", { class: "actions" }, ok)); input.focus();
  };
  const loeschen = el("button", { type: "button", class: "btn" }, "Outfit löschen");
  loeschen.onclick = async () => {
    if (!confirm(`„${o.name}“ löschen? Die Teile bleiben im Kleiderschrank.`)) return;
    try { await deleteOutfit(o.id); toast("Outfit gelöscht"); zurueck(); } catch (e) { toast("Hat nicht geklappt: " + (e?.message || e)); }
  };

  fill(box, kopf,
    el("div", { class: "panel" }, lookBox,
      mitInfo(el("strong", {}, "Foto vom Look"),
        "Speichere das Bild aus ChatGPT oder Gemini in deinen Fotos (dort „Sichern“) oder mach ein Spiegel-Selfie, und füge es hier hinzu.",
        "Es bleibt nur auf diesem Handy und kommt mit in deine Sicherung."),
      el("div", { class: "actions wrap" }, waehlen, o.foto ? entfernen : null)),
    el("div", { class: "panel" },
      el("div", { class: "kombi-nummern" }, o.nrs.map(n => `Nr. ${nrText(n)}`).join(" + ")),
      teile.length ? el("div", { class: "kombi-teile" }, ...teile.map(kachel)) : null,
      fehlt.length ? el("p", { class: "hint" }, `${fehlt.map(n => "Nr. " + nrText(n)).join(", ")} gibt es nicht mehr.`) : null,
      imKorb.length ? el("p", { class: "hint" }, `${imKorb.map(n => "Nr. " + nrText(n)).join(", ")} ${imKorb.length === 1 ? "liegt" : "liegen"} im Papierkorb.`) : null,
      nie.length ? el("p", { class: "hint" }, `${nie.map(t => "Nr. " + nrText(t.nr)).join(", ")} ${nie.length === 1 ? "ist" : "sind"} als „🚫 Ziehe ich nicht an“ markiert.`) : null,
      el("p", { class: "hint" }, `Gespeichert am ${datum(o.erstellt)} · ${o.quelle === "app" ? "Vorschlag der App" : "aus ChatGPT/Gemini"}`)),
    o.text ? el("details", { class: "panel mehr" }, el("summary", {}, "Erklärung und Tipps"), el("div", { class: "chatgpt-text" }, o.text)) : null,
    teile.length ? el("div", { class: "panel" }, el("strong", {}, "🖼 Bild vom Outfit"), paket(teile, "diesem Outfit aus meinem Kleiderschrank").el) : null,
    nameBox,
    el("div", { class: "actions wrap" }, umbenennen, loeschen));
}
