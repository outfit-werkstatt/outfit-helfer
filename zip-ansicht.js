// Etappe 1e: Sicherung als ZIP-Datei speichern und laden („Sicherung vom TT.MM.JJJJ Outfit Helfer.zip“).
// Inhalt: Fotos als „012 - T-Shirt braun.jpg“, Vorschaubilder, angaben.json (Teile, Ordner, Mein Stil, eigene Knöpfe,
// nächste Nummer) und „Lies mich.txt“. Teile im Papierkorb kommen nicht mit.
// Laden ERSETZT alles. Die Datei kann von irgendwoher stammen, darum wird sie misstrauisch gelesen: nur erwartete Dateien,
// Grenzen für Größe und Anzahl, jede Angabe geprüft (nur bekannte Felder, Längen gekürzt), Fotos neu gezeichnet.
// Erst wenn alles geprüft ist, kommt die Rückfrage – mit dem, was wirklich übernommen wird und was verloren ginge.
// Dateiname bewusst ohne „sicherung“ (die private Sperrliste würde die Datei sonst nicht hochladen).
import { zipErstellen, zipLesen } from "./zip-format.js?v=2";
import { allItems, getPhoto, getFolders, getStil, getCustom, getMeta, setMeta, replaceAll, askPersist, nrText } from "./speicher.js?v=8";
import { el, fill, toast, clean, cleanText, teilAngleichen } from "./ui.js?v=11";
import { stilAktuell, STIL_ABSCHNITTE, MODI } from "./stil.js?v=10";
import { GROUPS, GROUP_OF, loadImage, alsJpg } from "./ki.js?v=5";

const APP = "Outfit-Helfer", FORMAT = 1, TAG = 24 * 3600 * 1000, ERINNERN_TAGE = 14;
// Die ZIP wird Stück für Stück gelesen, darum darf sie groß sein; gehalten werden nur die neu gezeichneten Fotos
const MAX_ZIP = 2e9, MAX_TEILE = 3000, MAX_EINTRAEGE = 4 * MAX_TEILE + 100; // pro Teil Foto + Vorschau, ein Mac legt je Datei noch eine „._“-Datei dazu
const utf8 = s => new TextEncoder().encode(s);
const datumText = d => d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
const mb = n => (n / 1e6).toFixed(n < 10e6 ? 1 : 0).replace(".", ",") + " MB";
const anzahl = n => `${n} ${n === 1 ? "Teil" : "Teile"}`;
const mobil = () => matchMedia("(pointer: coarse)").matches;
// „Nr. 003, 004 und 3 weitere“
const nummern = (nrs, max = 12) => nrs.slice(0, max).map(nrText).join(", ") + (nrs.length > max ? ` und ${nrs.length - max} weitere` : "");
// Dateiname eines Fotos: Nummer vorn, nur Buchstaben, Ziffern und wenige Zeichen, die iPhone-Dateinamen vertragen
const ohneSonderzeichen = s => s.replace(/[^\p{L}\p{N} .,+&()'-]/gu, " ").replace(/\s+/g, " ").trim();
const fotoName = t => `${nrText(t.nr)} - ${ohneSonderzeichen(`${t.art} ${(t.farben || []).join(" ").toLowerCase()}`).slice(0, 60).trim() || "Teil"}.jpg`;
const vorschauName = nr => `Vorschaubilder/${nrText(nr)}.jpg`;
const LIES_MICH = "Sicherung des Outfit-Helfers\r\n\r\n" +
  "Zum Wiederherstellen: App öffnen, „Sicherung speichern / laden“ antippen, „Sicherung auswählen“ und diese ZIP-Datei wählen. Entpacken ist nicht nötig.\r\n\r\n" +
  "Die Fotos heißen nach ihrer Nummer (z. B. „012 - T-Shirt braun.jpg“). In angaben.json stehen alle Angaben, Ordner, „Mein Stil“ und eigene Knöpfe.\r\n\r\n" +
  "Die Datei enthält persönliche Fotos und Angaben. Nur an Menschen weitergeben, die das sehen dürfen.\r\n";

// Bild-Vektor (Float32Array) ↔ Text für angaben.json
const zuB64 = f => { const u = new Uint8Array(f.buffer, f.byteOffset, f.byteLength); let s = ""; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode(...u.subarray(i, i + 8192)); return btoa(s); };
function vonB64(s) {
  if (typeof s !== "string" || s.length > 20000) return null;
  try {
    const u = Uint8Array.from(atob(s), c => c.charCodeAt(0));
    if (u.length % 4) return null;
    const f = new Float32Array(u.buffer);
    if (f.length < 64 || f.length > 4096 || !f.every(Number.isFinite)) return null;
    const l = Math.hypot(...f); return l ? f.map(x => x / l) : null;
  } catch { return null; }
}

/* ---------- Stand: Was ist seit der letzten Sicherung anders? ---------- */
// letzte = meta "letzteSicherung" = { zeit, nrs } (welche Teile in der letzten ZIP waren),
// sonst = meta "sonstGeaendert" (wann zuletzt Ordner oder eigene Knöpfe geändert wurden)
export function zipStand(items, letzte, stil, sonst) {
  const da = items.filter(t => !t.geloescht);
  if (!letzte) return { nie: true, leer: !items.length, aenderungen: [] };
  const drin = new Set(letzte.nrs), jetzt = new Set(da.map(t => t.nr));
  const neu = da.filter(t => !drin.has(t.nr)).length, weg = letzte.nrs.filter(n => !jetzt.has(n)).length;
  const geaendert = da.filter(t => drin.has(t.nr) && t.geaendert > letzte.zeit).length;
  const aenderungen = [neu && `${neu} ${neu === 1 ? "neues Teil" : "neue Teile"}`, weg && `${weg} gelöscht`, geaendert && `${geaendert} geändert`,
    stil?.geaendert > letzte.zeit && "„Mein Stil“ geändert", sonst > letzte.zeit && "Ordner oder eigene Knöpfe geändert"].filter(Boolean);
  // Nach Kalendertagen zählen: Eine Sicherung von gestern Abend ist heute früh „gestern“, auch wenn keine 24 Stunden vergangen sind
  const tagAnfang = d => new Date(d).setHours(0, 0, 0, 0);
  const tage = Math.max(0, Math.round((tagAnfang(Date.now()) - tagAnfang(letzte.zeit)) / TAG));
  return { nie: false, tage, datum: datumText(new Date(letzte.zeit)), aenderungen };
}
const tageText = n => n === 0 ? "heute" : n === 1 ? "gestern" : `vor ${n} Tagen`;
// Karte auf der Startseite. Hervorgehoben, wenn es noch nie eine Sicherung gab oder die letzte über 14 Tage alt ist und sich etwas geändert hat.
export function zipKarte(items, letzte, stil, sonst, oeffnen) {
  const s = zipStand(items, letzte, stil, sonst);
  if (s.nie && s.leer) return el("div", { class: "panel hinweis" }, el("strong", {}, "Neues Handy oder App neu eingerichtet?"),
    el("p", {}, "Wenn du eine Sicherung hast, holst du damit deinen ganzen Kleiderschrank zurück."),
    el("button", { type: "button", class: "btn", onclick: oeffnen }, "Sicherung laden"));
  const warnen = s.nie || (s.aenderungen.length > 0 && s.tage >= ERINNERN_TAGE);
  const text = s.nie ? "Noch keine Sicherung. Geht das Handy kaputt oder räumt Safari den Speicher auf, wären sonst alle Teile weg."
    : `Letzte Sicherung: ${s.datum} (${tageText(s.tage)}). ` + (s.aenderungen.length ? `Seit deiner letzten Sicherung: ${s.aenderungen.join(", ")}. Jetzt sichern?` : "Seitdem hat sich nichts geändert ✓");
  return el("div", { class: "panel sicherung-karte" + (warnen ? " warnung" : "") },
    el("div", { class: "titel" }, "💾 Sicherung"), el("div", { class: "hint" }, text),
    el("div", { class: "actions" }, el("button", { type: "button", class: warnen || s.aenderungen.length ? "btn primary" : "btn", onclick: oeffnen }, "Sicherung speichern / laden")));
}

/* ---------- Sicherung erstellen ---------- */
async function erstellen(fortschritt) {
  const [alle, ordner, stil, eigene, naechste] = await Promise.all([allItems(), getFolders(), getStil(), getCustom(), getMeta("naechsteNr")]);
  const teile = alle.filter(t => !t.geloescht).sort((a, b) => a.nr - b.nr), dateien = [], angaben = [];
  for (const [i, t] of teile.entries()) {
    fortschritt(`Fotos sammeln: ${i + 1} von ${teile.length} …`);
    // Fehlt das große Foto (sollte nie passieren), wenigstens die Vorschau mitnehmen, damit das Teil nicht verloren geht
    const foto = (await getPhoto(t.nr)) || t.vorschau, name = fotoName(t);
    dateien.push({ name, data: foto }, { name: vorschauName(t.nr), data: t.vorschau });
    const { vorschau, vektor, geloescht, ...rest } = t;
    angaben.push({ ...rest, foto: name, vorschau: vorschauName(t.nr), vektor: vektor ? zuB64(vektor) : null });
  }
  const jetzt = new Date();
  const json = { app: APP, format: FORMAT, erstellt: jetzt.toISOString(), naechsteNr: Math.max(naechste || 1, ...alle.map(t => t.nr + 1)), // auch Nummern aus dem Papierkorb nie wieder vergeben
    teile: angaben, ordner, meinStil: stilAktuell(stil), eigeneWerte: eigene };
  dateien.unshift({ name: "angaben.json", data: utf8(JSON.stringify(json)) }, { name: "Lies mich.txt", data: utf8(LIES_MICH) });
  const blob = await zipErstellen(dateien, jetzt, (i, n) => fortschritt(`Sicherung packen: ${Math.round(100 * i / n)} % …`));
  return { blob, name: `Sicherung vom ${datumText(jetzt)} Outfit Helfer.zip`, zeit: jetzt.toISOString(), nrs: teile.map(t => t.nr), anzahl: teile.length };
}
// Auf dem Handy über „Teilen“ (dort „In Dateien sichern“), am PC als Download.
// Gibt null zurück, wenn im Teilen-Menü abgebrochen wurde. Klappt Teilen nicht, wird die Datei stattdessen heruntergeladen.
async function weitergeben(z) {
  const datei = new File([z.blob], z.name, { type: "application/zip" });
  if (mobil() && navigator.canShare?.({ files: [datei] })) {
    try { await navigator.share({ files: [datei] }); return "geteilt"; }
    catch (e) { if (e?.name === "AbortError") return null; console.error(e); }
  }
  const a = el("a", { href: URL.createObjectURL(z.blob), download: z.name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  return "geladen";
}

/* ---------- Sicherung laden: prüfen ---------- */
const GRUPPEN = new Set(GROUPS.map(([g]) => g)), SAISONS = ["Sommer", "Übergang", "Winter", "ganzjährig"];
const STIL_KEYS = STIL_ABSCHNITTE.flatMap(a => a.fragen.map(f => f.k));
const text = (v, max) => typeof v === "string" ? clean(v).slice(0, max).trim() || null : null;
const liste = (v, max, n) => Array.isArray(v) ? [...new Set(v.map(x => text(x, max)).filter(Boolean))].slice(0, n) : [];
const zeit = v => typeof v === "string" && v.length < 40 && !isNaN(Date.parse(v)) ? new Date(v).toISOString() : null;
const VERBOTEN = new Set(["__proto__", "constructor", "prototype"]);
// Baut aus angaben.json einen sauberen Stand: nur bekannte Felder, Texte gekürzt, unbrauchbare Teile ausgelassen
function pruefen(j) {
  if (!j || typeof j !== "object" || j.app !== APP || typeof j.format !== "number") throw new Error("Das ist keine Sicherung des Outfit-Helfers.");
  if (j.format > FORMAT) throw new Error("Diese Sicherung stammt aus einer neueren Version der App. Bitte die App schließen, neu öffnen und nochmal versuchen.");
  if (!Array.isArray(j.teile) || j.teile.length > MAX_TEILE) throw new Error("Die Liste der Teile in der Sicherung ist beschädigt.");
  const ordner = [], namen = new Set();
  for (const o of Array.isArray(j.ordner) ? j.ordner.slice(0, 200) : []) {
    const id = typeof o?.id === "string" && /^o[a-z0-9]{1,40}$/.test(o.id) ? o.id : null, name = text(o?.name, 30);
    if (id && name && !namen.has(name.toLowerCase()) && !ordner.some(x => x.id === id)) { ordner.push({ id, name }); namen.add(name.toLowerCase()); }
  }
  const ids = new Set(ordner.map(o => o.id)), nrs = new Set(), teile = [];
  let ausgelassen = 0;
  for (const t of j.teile) {
    const nr = t?.nr, art = text(t?.art, 30);
    if (!Number.isInteger(nr) || nr < 1 || nr > 999999 || nrs.has(nr) || !art) { ausgelassen++; continue; }
    nrs.add(nr);
    const k = t.ki && typeof t.ki === "object" ? t.ki : {};
    // Bekannte Arten bekommen ihre Gruppe aus der App (auch wenn sie in der Datei fehlt), eigene Arten die aus der Datei
    const teil = { nr, art, gruppe: GROUP_OF.get(art) ?? (GRUPPEN.has(t.gruppe) ? t.gruppe : null), farben: liste(t.farben, 30, 2),
      muster: text(t.muster, 30), material: text(t.material, 30), aermel: text(t.aermel, 30), schnitt: text(t.schnitt, 30),
      weite: text(t.weite, 30), laenge: text(t.laenge, 30), bund: text(t.bund, 30), stil: liste(t.stil, 30, 5),
      saison: liste(t.saison, 30, 4).filter(s => SAISONS.includes(s)),
      notiz: typeof t.notiz === "string" ? cleanText(t.notiz).slice(0, 200) || null : null, nichtAnziehen: t.nichtAnziehen === true,
      ordner: liste(t.ordner, 50, 50).filter(id => ids.has(id)), erstellt: zeit(t.erstellt) || new Date().toISOString(),
      ki: Object.fromEntries(["art", "farbe", "muster", "material", "aermel", "schnitt"].map(f => [f, text(k[f], 30)])),
      _foto: typeof t.foto === "string" ? t.foto : null, _vorschau: typeof t.vorschau === "string" ? t.vorschau : null };
    if (zeit(t.geaendert)) teil.geaendert = zeit(t.geaendert);
    if (typeof t.hash === "string" && /^[0-9a-f]{64}$/.test(t.hash)) teil.hash = t.hash;
    const v = vonB64(t.vektor); if (v) teil.vektor = v;
    teile.push(teilAngleichen(teil) || teil);
  }
  // „Mein Stil“: nur bekannte Fragen; ältere Sicherungen werden wie in der App umgeschrieben
  const s = j.meinStil && typeof j.meinStil === "object" ? j.meinStil : {}, stil = {};
  const werte = v => liste(Array.isArray(v) ? v : [v], 40, 40);
  for (const key of [...STIL_KEYS, "absatz"]) if (s[key] != null) stil[key] = werte(s[key]);
  if (MODI.includes(s.mode)) stil.mode = s.mode;
  for (const key of ["lieblingsfarben", "nichtFarben"]) if (s[key] != null) stil[key] = werte(s[key]);
  if (typeof s.text === "string") stil.text = cleanText(s.text).slice(0, 300) || null;
  if (zeit(s.geaendert)) stil.geaendert = zeit(s.geaendert);
  if (Array.isArray(stil.absatz)) stil.absatz = stil.absatz[0];
  // Eigene Knöpfe: { Liste: [{ wert, gruppe?, wie? }] }
  const e = j.eigeneWerte && typeof j.eigeneWerte === "object" ? j.eigeneWerte : {}, eigene = {};
  for (const [key, list] of Object.entries(e).slice(0, 60)) {
    const name = text(key, 60);
    if (!name || VERBOTEN.has(name) || !Array.isArray(list)) continue;
    const gesehen = new Set();
    eigene[name] = list.slice(0, 300).map(x => ({ wert: text(x?.wert, 30), gruppe: GRUPPEN.has(x?.gruppe) ? x.gruppe : null, wie: text(x?.wie, 30) }))
      .filter(x => x.wert && !gesehen.has(x.wert.toLowerCase()) && gesehen.add(x.wert.toLowerCase()))
      .map(x => ({ wert: x.wert, ...(x.gruppe ? { gruppe: x.gruppe } : {}), ...(x.wie ? { wie: x.wie } : {}) }));
  }
  const naechsteNr = Number.isInteger(j.naechsteNr) && j.naechsteNr > 0 && j.naechsteNr <= 1e6 ? j.naechsteNr : 1;
  return { erstellt: zeit(j.erstellt), teile, ordner, meinStil: stilAktuell(stil), eigeneWerte: eigene, naechsteNr, ausgelassen };
}
// Nur echte JPG-Bilder mit vernünftiger Größe annehmen (Größe steht im Kopf der Datei, vor dem Entschlüsseln prüfbar).
// Fotos der App haben höchstens etwa 1,5 Megapixel; 16 sind großzügig und für das Handy noch gut zu entpacken.
function jpgPruefen(b) {
  if (b[0] !== 0xFF || b[1] !== 0xD8) throw new Error("kein JPG");
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xFF) { i++; continue; }
    const m = b[i + 1];
    if (m === 0xFF || m === 0x01 || (m >= 0xD0 && m <= 0xD8)) { i++; continue; }
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
      const h = (b[i + 5] << 8) | b[i + 6], w = (b[i + 7] << 8) | b[i + 8];
      if (!w || !h || w * h > 16e6) throw new Error("Bild zu groß");
      return;
    }
    if (m === 0xDA) break;
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  throw new Error("JPG ohne Größenangabe");
}
// Foto neu zeichnen (statt die Datei ungeprüft zu übernehmen) → neues JPG als ArrayBuffer
async function fotoNeuZeichnen(bytes, max) {
  jpgPruefen(bytes);
  const img = await loadImage(new Blob([bytes], { type: "image/jpeg" }));
  try { return await (await alsJpg(img, max)).arrayBuffer(); }
  finally { URL.revokeObjectURL(img.src); }
}
// Wurde die ZIP entpackt und neu gepackt (Dateien-App, Windows, Mac), liegt alles oft in einem Unterordner,
// und ein Mac legt „__MACOSX“-Dateien dazu. angaben.json bestimmt, wo die Sicherung liegt.
// Fotos werden notfalls über die Nummer vorn im Namen gefunden (z. B. nach dem Umbenennen).
function inhalt(alle) {
  const echt = alle.filter(x => !x.name.startsWith("__MACOSX/") && !x.name.split("/").pop().startsWith("._"));
  const a = echt.filter(x => x.name === "angaben.json" || x.name.endsWith("/angaben.json"))
    .sort((x, y) => x.name.split("/").length - y.name.split("/").length)[0];
  if (!a) throw new Error("In der ZIP fehlt angaben.json. Ist das eine Sicherung dieser App?");
  const basis = a.name.slice(0, -"angaben.json".length);
  const dateien = new Map(echt.filter(x => x.name.startsWith(basis)).map(x => [x.name.slice(basis.length), x]));
  const nachNummer = new Map(); // Nummer → Datei (null, wenn mehrere Dateien mit derselben Nummer beginnen: dann nicht raten)
  for (const [name, x] of dateien) {
    const m = /^(\d{1,6})\b[^/]*\.jpe?g$/i.exec(name);
    if (m) nachNummer.set(Number(m[1]), nachNummer.has(Number(m[1])) ? null : x);
  }
  return { angaben: a, foto: (name, nr) => dateien.get(name) || nachNummer.get(nr) || null,
    vorschau: (name, nr) => dateien.get(name) || dateien.get(vorschauName(nr)) || null };
}
// Bildschirm „Bitte warten“: Während des Ladens darf nichts anderes gespeichert werden, sonst würde es überschrieben
function sperre(start) {
  const zeile = el("div", { class: "status" }, start);
  const box = el("div", { class: "sperre", role: "alertdialog", "aria-label": "Sicherung wird geladen" },
    el("div", { class: "panel" }, el("strong", {}, "Sicherung wird geladen"), zeile,
      el("p", { class: "hint" }, "Bitte die App geöffnet lassen und den Bildschirm nicht sperren.")));
  document.body.append(box); document.body.classList.add("ohne-scroll");
  return { text: t => { zeile.textContent = t; }, weg: () => { box.remove(); document.body.classList.remove("ohne-scroll"); } };
}

// Gibt eine Meldung zurück, wenn nichts geändert wurde (abgebrochen); nach Erfolg startet die Seite neu
async function laden(datei) {
  if (document.querySelector("#pruefen .check")) throw new Error("Bitte zuerst die offenen Fotos auf der Startseite speichern oder verwerfen.");
  if (datei.size > MAX_ZIP) throw new Error(`Die Datei ist zu groß (${mb(datei.size)}).`);
  const sp = sperre("Sicherung wird geöffnet …");
  try {
    const z = inhalt(await zipLesen(datei, { maxEintraege: MAX_EINTRAEGE }));
    let json;
    try { json = JSON.parse(new TextDecoder().decode(await z.angaben.lesen())); } catch { throw new Error("angaben.json ist beschädigt."); }
    const s = pruefen(json);
    // 1. Alle Fotos prüfen und neu zeichnen, BEVOR irgendetwas gefragt oder geändert wird
    const fotos = new Map(), teile = [], fehlen = [];
    for (const [i, t] of s.teile.entries()) {
      sp.text(`Fotos prüfen: ${i + 1} von ${s.teile.length} …`);
      const { _foto, _vorschau, ...teil } = t;
      try {
        const f = z.foto(_foto, teil.nr);
        if (!f) throw new Error("Foto fehlt");
        const roh = await f.lesen(), foto = await fotoNeuZeichnen(roh, 1200), v = z.vorschau(_vorschau, teil.nr);
        const vorschau = (v && await v.lesen().then(b => fotoNeuZeichnen(b, 400)).catch(() => null)) || await fotoNeuZeichnen(roh, 400);
        fotos.set(teil.nr, foto); teile.push({ ...teil, vorschau });
      } catch (e) { console.error(e); fehlen.push(teil.nr); }
    }
    if (s.teile.length && !teile.length) throw new Error("Keins der Fotos in der Sicherung ließ sich lesen. Es wurde nichts geändert.");
    // 2. Ehrlich fragen: was kommt, was fehlt, was ginge verloren
    const jetzt = await allItems(), kommt = new Set(teile.map(t => t.nr));
    const verloren = jetzt.filter(t => !t.geloescht && !kommt.has(t.nr)).map(t => t.nr).sort((a, b) => a - b);
    const imKorb = jetzt.filter(t => t.geloescht).length, unlesbar = fehlen.length + s.ausgelassen;
    const frage = [
      `Sicherung${s.erstellt ? " vom " + datumText(new Date(s.erstellt)) : ""}: ${anzahl(teile.length)}, ${s.ordner.length} Ordner` +
        `${Object.keys(s.meinStil).some(k => k !== "geaendert") ? ", „Mein Stil“" : ""}.`,
      unlesbar ? `⚠️ ${unlesbar === 1 ? "1 Teil" : unlesbar + " Teile"} aus der Sicherung ${unlesbar === 1 ? "lässt" : "lassen"} sich nicht lesen und ${unlesbar === 1 ? "wird" : "werden"} nicht übernommen` +
        (fehlen.length ? `: Nr. ${nummern(fehlen)}` : "") + (s.ausgelassen ? `${fehlen.length ? " und " : ": "}${s.ausgelassen} ohne gültige Nummer oder Art` : "") + "." : null,
      verloren.length ? `⚠️ ${verloren.length === 1 ? "Dieses Teil ist" : `Diese ${verloren.length} Teile sind`} jetzt in der App, aber nicht in der Sicherung und ${verloren.length === 1 ? "wäre" : "wären"} danach weg: Nr. ${nummern(verloren)}.` : null,
      imKorb ? `Der Papierkorb (${anzahl(imKorb)}) wird geleert.` : null,
      "Das ERSETZT alles, was jetzt in der App ist (Teile, Ordner, „Mein Stil“, eigene Knöpfe).",
      verloren.length ? "Tipp: Willst du den jetzigen Stand behalten, tippe auf „Abbrechen“ und erstelle zuerst eine Sicherung davon." : null,
      "Wiederherstellen?"].filter(Boolean).join("\n\n");
    if (!confirm(frage)) return "Abgebrochen – es wurde nichts geändert.";
    // 3. Alles in EINEM Schritt ersetzen. Nummern nie doppelt: weiter nach der höchsten aus Sicherung, App und bisherigem Zähler
    sp.text("Wird gespeichert …");
    const naechsteNr = Math.max(s.naechsteNr, ...s.teile.map(t => t.nr + 1), ...jetzt.map(t => t.nr + 1), (await getMeta("naechsteNr")) || 1);
    await replaceAll({ teile, fotos, meta: { naechsteNr, ordner: s.ordner, meinStil: s.meinStil, eigeneWerte: s.eigeneWerte,
      letzteSicherung: { zeit: s.erstellt || new Date().toISOString(), nrs: teile.map(t => t.nr) } } });
    await askPersist(); // auf einem neuen Handy gleich um dauerhaften Speicher bitten
    sp.weg();
    alert(`Wiederhergestellt: ${anzahl(teile.length)}.` + (unlesbar ? `\n\nNicht übernommen (Foto fehlt oder beschädigt): ${fehlen.length ? "Nr. " + nummern(fehlen, 50) : ""}` +
      `${fehlen.length && s.ausgelassen ? " und " : ""}${s.ausgelassen ? s.ausgelassen + " ohne gültige Nummer oder Art" : ""}` : ""));
    // Neu starten, damit alle Teile der App den neuen Stand lesen (z. B. die eigenen Knöpfe)
    history.replaceState({ v: "start", d: 0 }, "");
    location.reload();
    return null;
  } finally { sp.weg(); }
}

/* ---------- Ansicht „Sicherung“ ---------- */
export function renderZip(box, kopf, items, letzte, stil, sonst, aktualisieren) {
  const s = zipStand(items, letzte, stil, sonst), offen = document.querySelectorAll("#pruefen .check").length;
  const stand = s.nie ? "Noch keine Sicherung gespeichert." : `Letzte Sicherung: ${s.datum} (${tageText(s.tage)}).` +
    (s.aenderungen.length ? ` Seitdem: ${s.aenderungen.join(", ")}.` : " Seitdem nichts geändert ✓");
  const meldung = el("div", { class: "status" }), weiter = el("div", {});
  const gesichert = async z => {
    await setMeta("letzteSicherung", { zeit: z.zeit, nrs: z.nrs });
    toast("Sicherung gespeichert ✓"); aktualisieren();
  };
  const erstellenKnopf = el("button", { type: "button", class: "btn primary" }, "Sicherung erstellen");
  erstellenKnopf.onclick = async () => {
    erstellenKnopf.disabled = true; weiter.replaceChildren();
    try {
      const z = await erstellen(t => { meldung.textContent = t; });
      meldung.textContent = `Fertig: „${z.name}“ (${anzahl(z.anzahl)}, ${mb(z.blob.size)}).`;
      // Eigener Knopf zum Weitergeben: „Teilen“ braucht auf dem iPhone ein frisches Antippen
      const sichern = el("button", { type: "button", class: "btn primary" }, mobil() ? "In Dateien sichern …" : "Herunterladen");
      sichern.onclick = async () => {
        try {
          const wie = await weitergeben(z);
          if (!wie) return;
          // Am PC landet die Datei sicher im Download-Ordner. Auf dem Handy meldet „Teilen“ auch Erfolg, wenn sie z. B. nur
          // verschickt wurde – darum dort nachfragen, bevor die Erinnerung verstummt.
          if (!mobil()) return await gesichert(z);
          const ja = el("button", { type: "button", class: "btn primary" }, "Ja, gespeichert");
          const nein = el("button", { type: "button", class: "btn" }, "Nein");
          ja.onclick = () => gesichert(z).catch(e => toast("Hat nicht geklappt: " + (e?.message || e)));
          nein.onclick = () => fill(weiter, el("div", { class: "actions" }, sichern),
            el("p", { class: "hint" }, "Dann tippe nochmal auf „In Dateien sichern …“ und wähle im Teilen-Menü „In Dateien sichern“."));
          fill(weiter, el("p", {}, "Ist die Sicherung jetzt in der Dateien-App gespeichert?"), el("div", { class: "actions" }, nein, ja));
        } catch (e) { toast("Hat nicht geklappt: " + (e?.message || e)); console.error(e); }
      };
      fill(weiter, el("div", { class: "actions" }, sichern), mobil()
        ? el("div", { class: "hint" }, "Im Teilen-Menü „In Dateien sichern“ wählen und dann den Ort:",
            el("ul", {}, el("li", {}, el("strong", {}, "iCloud Drive:"), " bleibt erhalten, auch wenn das Handy verloren geht oder kaputtgeht. Die Datei liegt dann aber auch auf Apples Servern (in deinem iCloud-Konto)."),
              el("li", {}, el("strong", {}, "Auf meinem iPhone:"), " bleibt nur auf dem Handy. Ist das Handy weg, ist auch die Sicherung weg.")),
            "Die ZIP in der Dateien-App nicht antippen – sonst packt das iPhone sie aus (schadet nicht, die ZIP bleibt).")
        : el("p", { class: "hint" }, "Die Datei landet im Download-Ordner. Am besten danach an einen sicheren zweiten Ort kopieren (z. B. USB-Stick)."));
    } catch (e) { meldung.textContent = "❌ Sicherung hat nicht geklappt: " + (e?.message || e); console.error(e); }
    erstellenKnopf.disabled = false;
  };
  const ladenStatus = el("div", { class: "status" });
  const eingabe = el("input", { type: "file", accept: ".zip,application/zip", hidden: true });
  eingabe.onchange = async () => {
    const datei = eingabe.files[0]; eingabe.value = "";
    if (!datei) return;
    ladenStatus.textContent = "";
    try { const m = await laden(datei); if (m) ladenStatus.textContent = m; }
    catch (e) { ladenStatus.textContent = "❌ " + (e?.message || e); console.error(e); }
  };
  fill(box, kopf,
    el("div", { class: "panel" },
      el("strong", {}, "Sicherung speichern"),
      el("p", { class: "hint" }, "Packt alle Teile mit Fotos, Ordner, „Mein Stil“ und deine eigenen Knöpfe in eine ZIP-Datei. Teile im Papierkorb kommen nicht mit."),
      el("p", { class: "hint" }, stand),
      offen ? el("p", { class: "hint" }, `Noch ${offen} ${offen === 1 ? "Foto" : "Fotos"} auf der Startseite nicht gespeichert – die kommen nicht mit.`) : null,
      el("div", { class: "actions" }, erstellenKnopf), meldung, weiter,
      el("p", { class: "hint" }, `Tipp: ${mobil() ? "In der Dateien-App" : "Im Ordner"} nach „Datum“ sortieren, nicht nach „Name“. Die Datei enthält deine Fotos und „Mein Stil“ – nur an Menschen weitergeben, die das sehen dürfen.`)),
    el("div", { class: "panel" },
      el("strong", {}, "Sicherung laden"),
      el("p", { class: "hint" }, "Holt den Stand aus einer Sicherung zurück, z. B. auf einem neuen Handy. ",
        el("strong", {}, "Achtung:"), " Das ersetzt alles, was jetzt in der App ist (Teile, Ordner, „Mein Stil“, Papierkorb). Vorher prüft die App die Datei und sagt dir genau, was übernommen wird und was verloren ginge."),
      el("label", { class: "btn datei" }, "Sicherung auswählen …", eingabe), ladenStatus));
}
