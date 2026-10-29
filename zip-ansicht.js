// Etappe 1e: Sicherung als ZIP-Datei speichern und laden („Sicherung vom TT.MM.JJJJ.zip“).
// Inhalt: Fotos als „012 - T-Shirt braun.jpg“, Vorschaubilder, angaben.json (Teile, Ordner, Mein Stil, eigene Knöpfe,
// nächste Nummer) und „Lies mich.txt“. Teile im Papierkorb kommen nicht mit.
// Laden ERSETZT alles. Die Datei kann von irgendwoher stammen, darum wird sie misstrauisch gelesen: nur erwartete Dateien,
// Grenzen für Größe und Anzahl, jede Angabe geprüft (nur bekannte Felder, Längen gekürzt), Fotos neu gezeichnet.
// Dateiname bewusst ohne „sicherung“ (die private Sperrliste würde die Datei sonst nicht hochladen).
import { zipErstellen, zipLesen } from "./zip-format.js?v=1";
import { allItems, getPhoto, getFolders, getStil, getCustom, getMeta, setMeta, replaceAll, nrText } from "./speicher.js?v=6";
import { $, el, fill, toast, field, clean, cleanText, teilAngleichen } from "./ui.js?v=6";
import { stilAktuell, STIL_ABSCHNITTE, MODI } from "./stil.js?v=5";
import { GROUPS, loadImage, toCanvas, canvasToBlob } from "./ki.js?v=4";

const APP = "Outfit-Helfer", FORMAT = 1, TAG = 24 * 3600 * 1000, ERINNERN_TAGE = 14;
const MAX_ZIP = 600e6, MAX_TEILE = 5000;
const utf8 = s => new TextEncoder().encode(s);
const datumText = d => d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
const mb = n => (n / 1e6).toFixed(n < 10e6 ? 1 : 0).replace(".", ",") + " MB";
const anzahl = n => `${n} ${n === 1 ? "Teil" : "Teile"}`;
// Dateiname eines Fotos: Nummer vorn, nur Buchstaben, Ziffern und wenige Zeichen, die iPhone-Dateinamen vertragen
const ohneSonderzeichen = s => s.replace(/[^\p{L}\p{N} .,+&()'-]/gu, " ").replace(/\s+/g, " ").trim();
const fotoName = t => `${nrText(t.nr)} - ${ohneSonderzeichen(`${t.art} ${(t.farben || []).join(" ").toLowerCase()}`).slice(0, 60).trim() || "Teil"}.jpg`;
const LIES_MICH = "Sicherung des Outfit-Helfers\r\n\r\n" +
  "Zum Wiederherstellen: App öffnen, „Sicherung“ antippen, „Sicherung laden“ und diese ZIP-Datei auswählen. Entpacken ist nicht nötig.\r\n\r\n" +
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
// letzte = meta "letzteSicherung" = { zeit, nrs } (welche Teile in der letzten ZIP waren)
export function zipStand(items, letzte, stil) {
  const da = items.filter(t => !t.geloescht);
  if (!letzte) return { nie: true, leer: !items.length, aenderungen: [] };
  const drin = new Set(letzte.nrs), jetzt = new Set(da.map(t => t.nr));
  const neu = da.filter(t => !drin.has(t.nr)).length, weg = letzte.nrs.filter(n => !jetzt.has(n)).length;
  const geaendert = da.filter(t => drin.has(t.nr) && t.geaendert > letzte.zeit).length;
  const aenderungen = [neu && `${neu} ${neu === 1 ? "neues Teil" : "neue Teile"}`, weg && `${weg} gelöscht`, geaendert && `${geaendert} geändert`,
    stil?.geaendert > letzte.zeit && "„Mein Stil“ geändert"].filter(Boolean);
  const tage = Math.max(0, Math.floor((Date.now() - Date.parse(letzte.zeit)) / TAG));
  return { nie: false, tage, datum: datumText(new Date(letzte.zeit)), aenderungen };
}
const tageText = n => n === 0 ? "heute" : n === 1 ? "gestern" : `vor ${n} Tagen`;
// Karte auf der Startseite. Hervorgehoben, wenn es noch nie eine Sicherung gab oder die letzte über 14 Tage alt ist und sich etwas geändert hat.
export function zipKarte(items, letzte, stil, oeffnen) {
  const s = zipStand(items, letzte, stil);
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
    fortschritt(`Fotos einpacken: ${i + 1} von ${teile.length} …`);
    const foto = await getPhoto(t.nr), name = fotoName(t), vName = `Vorschaubilder/${nrText(t.nr)}.jpg`;
    if (foto) dateien.push({ name, data: new Uint8Array(await foto.arrayBuffer()) });
    dateien.push({ name: vName, data: new Uint8Array(await t.vorschau.arrayBuffer()) });
    const { vorschau, vektor, geloescht, ...rest } = t;
    angaben.push({ ...rest, foto: foto ? name : null, vorschau: vName, vektor: vektor ? zuB64(vektor) : null });
  }
  const jetzt = new Date();
  const json = { app: APP, format: FORMAT, erstellt: jetzt.toISOString(), naechsteNr: Math.max(naechste || 1, ...alle.map(t => t.nr + 1)), // auch Nummern aus dem Papierkorb nie wieder vergeben
    teile: angaben, ordner, meinStil: stilAktuell(stil), eigeneWerte: eigene };
  dateien.unshift({ name: "angaben.json", data: utf8(JSON.stringify(json)) }, { name: "Lies mich.txt", data: utf8(LIES_MICH) });
  return { blob: zipErstellen(dateien, jetzt), name: `Sicherung vom ${datumText(jetzt)}.zip`, zeit: jetzt.toISOString(), nrs: teile.map(t => t.nr), anzahl: teile.length };
}
// Auf dem Handy über „Teilen“ (dort „In Dateien sichern“), am PC als Download. Gibt false zurück, wenn abgebrochen.
// Klappt Teilen nicht (z. B. vom Browser verweigert), wird die Datei stattdessen heruntergeladen.
async function weitergeben(z) {
  const datei = new File([z.blob], z.name, { type: "application/zip" });
  if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [datei] })) {
    try { await navigator.share({ files: [datei] }); return true; }
    catch (e) { if (e?.name === "AbortError") return false; console.error(e); }
  }
  const a = el("a", { href: URL.createObjectURL(z.blob), download: z.name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  return true;
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
    const teil = { nr, art, gruppe: GRUPPEN.has(t.gruppe) ? t.gruppe : null, farben: liste(t.farben, 30, 2),
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
  // Eigene Knöpfe: { Liste: [{ wert, gruppe? }] }
  const e = j.eigeneWerte && typeof j.eigeneWerte === "object" ? j.eigeneWerte : {}, eigene = {};
  for (const [key, list] of Object.entries(e).slice(0, 60)) {
    const name = text(key, 60);
    if (!name || VERBOTEN.has(name) || !Array.isArray(list)) continue;
    const gesehen = new Set();
    eigene[name] = list.slice(0, 300).map(x => ({ wert: text(x?.wert, 30), gruppe: GRUPPEN.has(x?.gruppe) ? x.gruppe : undefined }))
      .filter(x => x.wert && !gesehen.has(x.wert.toLowerCase()) && gesehen.add(x.wert.toLowerCase()))
      .map(x => x.gruppe ? x : { wert: x.wert });
  }
  const naechsteNr = Number.isInteger(j.naechsteNr) && j.naechsteNr > 0 && j.naechsteNr <= 1e6 ? j.naechsteNr : 1;
  return { erstellt: zeit(j.erstellt), teile, ordner, meinStil: stilAktuell(stil), eigeneWerte: eigene, naechsteNr, ausgelassen };
}
// Nur echte JPG-Bilder mit vernünftiger Größe annehmen (Größe steht im Kopf der Datei, vor dem Entschlüsseln prüfbar)
function jpgPruefen(b) {
  if (b[0] !== 0xFF || b[1] !== 0xD8) throw new Error("kein JPG");
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xFF) { i++; continue; }
    const m = b[i + 1];
    if (m === 0xFF || m === 0x01 || (m >= 0xD0 && m <= 0xD8)) { i++; continue; }
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
      const h = (b[i + 5] << 8) | b[i + 6], w = (b[i + 7] << 8) | b[i + 8];
      if (!w || !h || w * h > 50e6) throw new Error("Bild zu groß");
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
  try { return await (await canvasToBlob(toCanvas(img, max, true), 0.85)).arrayBuffer(); }
  finally { URL.revokeObjectURL(img.src); }
}

async function laden(datei, status) {
  if (document.querySelector("#pruefen .check")) throw new Error("Bitte zuerst die offenen Fotos auf der Startseite speichern oder verwerfen.");
  if (datei.size > MAX_ZIP) throw new Error(`Die Datei ist zu groß (${mb(datei.size)}).`);
  status("Sicherung wird geöffnet …");
  const eintraege = new Map(zipLesen(await datei.arrayBuffer()).map(x => [x.name, x]));
  const a = eintraege.get("angaben.json");
  if (!a) throw new Error("In der ZIP fehlt angaben.json. Ist das eine Sicherung dieser App?");
  let json;
  try { json = JSON.parse(new TextDecoder().decode(await a.lesen())); } catch { throw new Error("angaben.json ist beschädigt."); }
  const s = pruefen(json), jetzt = await allItems();
  const frage = `Sicherung${s.erstellt ? " vom " + datumText(new Date(s.erstellt)) : ""}: ${anzahl(s.teile.length)}, ${s.ordner.length} Ordner` +
    `${Object.keys(s.meinStil).some(k => k !== "geaendert") ? ", „Mein Stil“" : ""}.\n\n` +
    `Das ERSETZT alles, was jetzt in der App ist (${anzahl(jetzt.length)} mit Papierkorb, Ordner, „Mein Stil“, eigene Knöpfe).\n\nWiederherstellen?`;
  if (!confirm(frage)) { status(""); return; }
  const fotos = new Map(), teile = [], fehlen = [];
  for (const [i, t] of s.teile.entries()) {
    status(`Fotos prüfen: ${i + 1} von ${s.teile.length} …`);
    const { _foto, _vorschau, ...teil } = t;
    try {
      const f = eintraege.get(_foto);
      if (!f || !_foto.toLowerCase().endsWith(".jpg")) throw new Error("Foto fehlt");
      const roh = await f.lesen(), foto = await fotoNeuZeichnen(roh, 1200);
      const v = eintraege.get(_vorschau);
      const vorschau = (v && await v.lesen().then(b => fotoNeuZeichnen(b, 400)).catch(() => null)) || await fotoNeuZeichnen(roh, 400);
      fotos.set(teil.nr, foto); teile.push({ ...teil, vorschau });
    } catch (e) { console.error(e); fehlen.push(teil.nr); }
  }
  status("Wird gespeichert …");
  // Nummern nie doppelt: weiter nach der höchsten Nummer aus Sicherung, App und bisherigem Zähler
  const naechsteNr = Math.max(s.naechsteNr, ...s.teile.map(t => t.nr + 1), ...jetzt.map(t => t.nr + 1), (await getMeta("naechsteNr")) || 1);
  await replaceAll({ teile, fotos, meta: { naechsteNr, ordner: s.ordner, meinStil: s.meinStil, eigeneWerte: s.eigeneWerte,
    letzteSicherung: { zeit: s.erstellt || new Date().toISOString(), nrs: teile.map(t => t.nr) } } });
  const fehlt = [...fehlen.map(nrText), ...(s.ausgelassen ? [`${s.ausgelassen} mit ungültiger Nummer oder ohne Art`] : [])];
  alert(`Wiederhergestellt: ${anzahl(teile.length)}.` + (fehlt.length ? `\n\nNicht übernommen (Foto fehlt oder beschädigt): ${fehlt.join(", ")}` : ""));
  // Neu starten, damit alle Teile der App den neuen Stand lesen (z. B. die eigenen Knöpfe)
  history.replaceState({ v: "start", d: 0 }, "");
  location.reload();
}

/* ---------- Ansicht „Sicherung“ ---------- */
export function renderZip(box, kopf, items, letzte, stil, aktualisieren) {
  const s = zipStand(items, letzte, stil), offen = document.querySelectorAll("#pruefen .check").length;
  const stand = s.nie ? "Noch keine Sicherung gespeichert." : `Letzte Sicherung: ${s.datum} (${tageText(s.tage)}).` +
    (s.aenderungen.length ? ` Seitdem: ${s.aenderungen.join(", ")}.` : " Seitdem nichts geändert ✓");
  const meldung = el("div", { class: "status" }), weiter = el("div", {});
  const erstellenKnopf = el("button", { type: "button", class: "btn primary" }, "Sicherung erstellen");
  erstellenKnopf.onclick = async () => {
    erstellenKnopf.disabled = true; weiter.replaceChildren();
    try {
      const z = await erstellen(t => { meldung.textContent = t; });
      meldung.textContent = `Fertig: „${z.name}“ (${anzahl(z.anzahl)}, ${mb(z.blob.size)}).`;
      // Eigener Knopf zum Weitergeben: „Teilen“ braucht auf dem iPhone ein frisches Antippen
      const sichern = el("button", { type: "button", class: "btn primary" }, matchMedia("(pointer: coarse)").matches ? "In Dateien sichern …" : "Herunterladen");
      sichern.onclick = async () => {
        try {
          if (!(await weitergeben(z))) return;
          await setMeta("letzteSicherung", { zeit: z.zeit, nrs: z.nrs });
          toast("Sicherung gespeichert ✓"); aktualisieren();
        } catch (e) { toast("Hat nicht geklappt: " + (e?.message || e)); console.error(e); }
      };
      fill(weiter, el("div", { class: "actions" }, sichern),
        el("p", { class: "hint" }, "Im Teilen-Menü „In Dateien sichern“ wählen, am besten in iCloud Drive. Dann ist die Sicherung auch da, wenn das Handy verloren geht."));
    } catch (e) { meldung.textContent = "❌ Sicherung hat nicht geklappt: " + (e?.message || e); console.error(e); }
    erstellenKnopf.disabled = false;
  };
  const ladenStatus = el("div", { class: "status" });
  const eingabe = el("input", { type: "file", accept: ".zip,application/zip", hidden: true });
  eingabe.onchange = async () => {
    const datei = eingabe.files[0]; eingabe.value = "";
    if (!datei) return;
    try { await laden(datei, t => { ladenStatus.textContent = t; }); }
    catch (e) { ladenStatus.textContent = "❌ " + (e?.message || e); console.error(e); }
  };
  fill(box, kopf,
    el("div", { class: "panel" },
      el("strong", {}, "Sicherung speichern"),
      el("p", { class: "hint" }, "Packt alle Teile mit Fotos, Ordner, „Mein Stil“ und deine eigenen Knöpfe in eine ZIP-Datei. Teile im Papierkorb kommen nicht mit."),
      el("p", { class: "hint" }, stand),
      offen ? el("p", { class: "hint" }, `Noch ${offen} ${offen === 1 ? "Foto" : "Fotos"} auf der Startseite nicht gespeichert – die kommen nicht mit.`) : null,
      el("div", { class: "actions" }, erstellenKnopf), meldung, weiter,
      el("p", { class: "hint" }, "Tipp: In der Dateien-App nach „Datum“ sortieren, nicht nach „Name“. Die Datei enthält deine Fotos und „Mein Stil“ – nur an Menschen weitergeben, die das sehen dürfen.")),
    el("div", { class: "panel" },
      el("strong", {}, "Sicherung laden"),
      el("p", { class: "hint" }, "Holt den Stand aus einer Sicherung zurück, z. B. auf einem neuen Handy. ",
        el("strong", {}, "Achtung:"), " Das ersetzt alles, was jetzt in der App ist (Teile, Ordner, „Mein Stil“, Papierkorb). Vorher kommt eine Rückfrage."),
      el("label", { class: "btn datei" }, "Sicherung auswählen …", eingabe), ladenStatus));
}
