// Etappe 2: Regeln für Outfit-Vorschläge. Zeitlose Grundregeln, von uns geschrieben (Trends und Kreatives kommen über ChatGPT).
// Reine Rechnung ohne Anzeige: bekommt Teile und „Mein Stil“, gibt Kombinationen, Tipps und Kaufideen zurück.
// Vorlieben, keine Verbote: „Mein Stil“ verändert nur die Reihenfolge. Hartes Nie sind nur 🚫 und Papierkorb (siehe kandidaten).
// Selbst eingetippte Einträge zählen über ihr „Ähnlich wie“; ohne das gelten sie als „passt zu vielem“.
import { GROUP_OF } from "./ki.js?v=5";
import { farbeRgb, wieVon, saisonVorschlag, groupOf } from "./ui.js?v=10";

/* ---------- Was ist das für ein Teil? ---------- */
// Art → [Platz im Outfit, Schick-Stufe 1 (sehr lässig) bis 5 (sehr schick)]
const ARTEN = {
  "T-Shirt": ["oben", 2], "Poloshirt": ["oben", 3], "Langarmshirt": ["oben", 2], "Top": ["oben", 2], "Bluse": ["oben", 4], "Hemd": ["oben", 4], "Body": ["oben", 3],
  "Pullover": ["oben", 3], "Sweatshirt / Hoodie": ["oben", 1], "Strickjacke": ["lage", 3], "Weste": ["lage", 3], "Blazer": ["lage", 5], "Jacke": ["lage", 2], "Mantel": ["lage", 4],
  "Jeans": ["unten", 2], "Hose": ["unten", 4], "Leggings": ["unten", 1], "Jogginghose": ["unten", 1], "Shorts": ["unten", 1], "Rock": ["unten", 3],
  "Kleid": ["ganz", 4], "Jumpsuit": ["ganz", 4],
  "Sneaker": ["schuh", 2], "Stiefel": ["schuh", 3], "Absatzschuhe": ["schuh", 5], "Flache Schuhe": ["schuh", 3], "Sandalen": ["schuh", 2],
  "Tasche": ["tasche", 3], "Rucksack": ["tasche", 1], "Halskette": ["schmuck", 3], "Ohrringe": ["schmuck", 3], "Armband": ["schmuck", 3], "Ring": ["schmuck", 3], "Uhr": ["schmuck", 3],
  "Haarschmuck": ["zubehoer", 3], "Gürtel": ["guertel", 3], "Schal / Tuch": ["zubehoer", 3], "Hut / Mütze": ["zubehoer", 2], "Sonnenbrille": ["zubehoer", 2], "Handschuhe": ["zubehoer", 3], "Strumpfhose": ["zubehoer", 3],
  "Bikini / Badeanzug": ["bade", 1]
};
const GRUPPEN_PLATZ = { "Oberteile": "oben", "Jacken & Mäntel": "lage", "Unterteile": "unten", "Kleider & Einteiler": "ganz", "Schuhe": "schuh", "Taschen": "tasche", "Schmuck": "schmuck", "Haar": "zubehoer", "Accessoires": "zubehoer", "Bademode": "bade" };
// Die Art, mit der gerechnet wird: die eigene oder ihr „Ähnlich wie“
const basisArt = t => GROUP_OF.has(t.art) ? t.art : wieVon("Art", t.art);
export const platzVon = t => ARTEN[basisArt(t)]?.[0] ?? GRUPPEN_PLATZ[t.gruppe ?? groupOf(t.art)] ?? "zubehoer";
const SCHICK_PLUS = { elegant: 1, Business: 1, klassisch: 0.5, "schick-lässig": 0.5, lässig: -0.5, sportlich: -1, Streetwear: -1 };
function schick(t) {
  let s = ARTEN[basisArt(t)]?.[1] ?? 3;
  for (const st of t.stil || []) s += SCHICK_PLUS[st] ?? 0;
  if (["Seide / Satin", "Samt"].includes(t.material)) s += 0.5;
  return Math.min(5, Math.max(1, s));
}
const schickWort = s => s >= 3.75 ? "eher schick" : s <= 2.25 ? "eher lässig" : "alltagstauglich";
const saisonVon = t => t.saison?.length ? t.saison : saisonVorschlag(t.art, t.gruppe, t.material);

/* ---------- Farben ---------- */
// Neutrale Farben passen zu fast allem (auch Denim, Erdtöne und Metall)
const NEUTRAL = new Set(["Schwarz", "Graphit", "Anthrazit", "Grau", "Steingrau", "Hellgrau", "Weiß", "Elfenbein", "Creme", "Sand", "Beige", "Nude", "Taupe", "Camel", "Cognac", "Braun", "Schoko", "Dunkelbraun",
  "Khaki", "Oliv", "Jeansblau", "Dunkelblau", "Gold", "Silber", "Roségold", "Kupfer", "Bronze"]);
const BUNT = "Bunt / mehrfarbig";
// Farbe auflösen: eigene Farbe über ihr „Ähnlich wie“. rgb null = unbekannt (passt zu vielem)
function farbe(name) {
  const basis = farbeRgb(name) || name === BUNT ? name : wieVon("Farbe", name);
  if (!basis) return { name, unbekannt: true };
  if (basis === BUNT) return { name, bunt: true };
  const rgb = farbeRgb(basis);
  if (!rgb) return { name, unbekannt: true };
  const [r, g, b] = rgb.map(x => x / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { name, basis, rgb, h: h * 60, s, l, neutral: NEUTRAL.has(basis) };
}
const hauptFarbe = t => t.farben?.length ? farbe(t.farben[0]) : { name: null, unbekannt: true };
const warm = f => f.rgb && f.rgb[0] - f.rgb[2] > 15;
const naheFarben = (a, b) => a.rgb && b.rgb && Math.hypot(a.rgb[0] - b.rgb[0], a.rgb[1] - b.rgb[1], a.rgb[2] - b.rgb[2]) < 60;
// Wie gut passen zwei Farben? art: neutral | tonInTon | verwandt | kontrast | bunt | offen | beisst
function farbPaar(a, b) {
  if (a.unbekannt || b.unbekannt) return { wert: 1, art: "offen" };
  if (a.bunt || b.bunt) return (a.neutral || b.neutral) ? { wert: 2, art: "neutral" } : a.bunt && b.bunt ? { wert: -1, art: "beisst" } : { wert: 0.6, art: "bunt" };
  if (a.neutral && b.neutral) {
    const beideDunkel = a.l < 0.3 && b.l < 0.3 && a.basis !== b.basis; // z. B. Schwarz + Dunkelbraun verschwimmt leicht
    return { wert: beideDunkel ? 1.2 : 2, art: "neutral" };
  }
  if (a.neutral || b.neutral) return { wert: 2, art: "neutral" };
  const d = Math.min(Math.abs(a.h - b.h), 360 - Math.abs(a.h - b.h));
  if (d <= 20) return { wert: 2, art: "tonInTon" };
  if (d <= 50) return { wert: 1.6, art: "verwandt" };
  if (d >= 150) return { wert: 1.4, art: "kontrast" };
  return { wert: 0.2, art: "beisst" };
}
const gemustert = t => {
  const m = t.muster && (wieVon("Muster", t.muster) || t.muster);
  return !!m && m !== "Einfarbig";
};

/* ---------- Passen zwei Teile zusammen? ---------- */
function paar(a, b) {
  let w = farbPaar(hauptFarbe(a), hauptFarbe(b)).wert;
  if (gemustert(a) && gemustert(b)) w -= 1.5; // zwei Muster beißen sich leicht; ein Muster allein ist weder Plus noch Minus
  const schuh = platzVon(a) === "schuh" || platzVon(b) === "schuh", abstand = Math.abs(schick(a) - schick(b));
  w += abstand <= 1 ? 1 : abstand <= 2 ? 0 : schuh ? -1 : -2; // Schuhe dürfen etwas stärker brechen (Blazer + Sneaker)
  const sa = saisonVon(a), sb = saisonVon(b);
  if (!sa.includes("ganzjährig") && !sb.includes("ganzjährig") && !sa.some(x => sb.includes(x))) w -= 2;
  return w;
}
// Grober Bruch: Saisons schließen sich aus, oder die Kleidung (ohne Schuhe) liegt bei der Schick-Stufe weit auseinander
function bricht(teile) {
  for (let i = 0; i < teile.length; i++) for (let j = i + 1; j < teile.length; j++) {
    const a = teile[i], b = teile[j], sa = saisonVon(a), sb = saisonVon(b);
    if (!sa.includes("ganzjährig") && !sb.includes("ganzjährig") && !sa.some(x => sb.includes(x))) return true;
    if (platzVon(a) !== "schuh" && platzVon(b) !== "schuh" && Math.abs(schick(a) - schick(b)) >= 3) return true;
  }
  return false;
}
// Mittelwert aller Paare = wie stimmig ist die ganze Kombination?
function stimmig(teile) {
  let summe = 0, n = 0;
  for (let i = 0; i < teile.length; i++) for (let j = i + 1; j < teile.length; j++) { summe += paar(teile[i], teile[j]); n++; }
  return n ? summe / n : 0;
}

/* ---------- „Mein Stil“: Pluspunkte, nie ein Ausschluss ---------- */
function stilPunkte(t, s) {
  if (!s) return 0;
  const hat = (k, v) => v != null && (s[k] || []).includes(v);
  const f = hauptFarbe(t);
  let p = 0;
  if ((t.stil || []).some(x => hat("richtung", x))) p += 2;
  if (hat("oben", t.weite)) p += 1;
  if (hat("unten", t.schnitt)) p += 1;
  if (hat("taille", t.bund)) p += 1;
  if (hat("aermel", t.aermel)) p += 1;
  if (hat("laenge", t.laenge)) p += 1;
  if (hat("schuhe", basisArt(t))) p += 1.5;
  if (hat("muster", t.muster)) p += 1;
  if (gemustert(t) && hat("muster", "auffällige Muster")) p += 1;
  if (gemustert(t) && hat("muster", "dezente Muster")) p += 0.5;
  if (!gemustert(t) && hat("muster", "Einfarbig")) p += 1;
  if ((s.lieblingsfarben || []).some(n => n === f.name || naheFarben(farbe(n), f))) p += 1.5;
  if ((s.nichtFarben || []).some(n => n === f.name || naheFarben(farbe(n), f))) p -= 2;
  if (hat("farbstil", "kräftig") && f.s > 0.55 && f.l > 0.3 && f.l < 0.7 && !f.neutral) p += 1;
  if (hat("farbstil", "gedeckt / neutral") && f.neutral) p += 1;
  if (hat("farbstil", "pastell") && f.l > 0.75 && !f.neutral) p += 1;
  if (hat("farbstil", "Schwarz-Weiß") && ["Schwarz", "Weiß"].includes(f.basis)) p += 1;
  if (platzVon(t) === "schmuck" && (s.schmuck || []).includes(f.basis)) p += 1.5;
  const bauchfrei = t.laenge === "bauchfrei", kurz = basisArt(t) === "Shorts" || t.laenge === "mini";
  if (bauchfrei && hat("bauchfrei", "lieber nicht")) p -= 2;
  if (bauchfrei && hat("bauchfrei", "gern")) p += 1;
  if (kurz && hat("beine", "lieber bedeckt")) p -= 1;
  if (kurz && hat("beine", "gern zeigen")) p += 1;
  return p;
}
const stilSchnitt = (teile, s) => teile.reduce((sum, t) => sum + stilPunkte(t, s), 0) / teile.length;

/* ---------- Tipps und Begründung ---------- */
const nr = t => `Nr. ${String(t.nr).padStart(3, "0")}`;
function warum(teile) {
  const a = hauptFarbe(teile[0]), schnitt = teile.reduce((s, t) => s + schick(t), 0) / teile.length;
  const gleich = (x, y) => x.name && x.name === y.name;
  for (const t of teile.slice(1)) {
    const b = hauptFarbe(t), art = farbPaar(a, b).art;
    if (art === "offen" || gleich(a, b)) continue;
    const ruhig = a.neutral ? a : b, bunt = a.neutral ? b : a;
    const text = art === "neutral" ? (a.neutral && b.neutral ? `${a.name} und ${b.name} sind beide neutral und ruhig.` : `${ruhig.name} ist neutral und passt zu ${bunt.name}.`)
      : art === "tonInTon" ? `${a.name} und ${b.name} sind Ton in Ton.` : art === "verwandt" ? `${a.name} und ${b.name} sind verwandte Farben.`
      : art === "kontrast" ? `${a.name} und ${b.name} bilden einen Kontrast.` : null;
    if (text) return `${text} Insgesamt ${schickWort(schnitt)}.`;
  }
  return `Insgesamt ${schickWort(schnitt)}.`;
}
function tipps(teile, extras, s) {
  const o = [];
  const oben = teile.find(t => platzVon(t) === "oben"), unten = teile.find(t => platzVon(t) === "unten"), ganz = teile.find(t => platzVon(t) === "ganz");
  const lage = [...teile, ...extras].find(t => platzVon(t) === "lage"), schmuckTeil = [...teile, ...extras].find(t => platzVon(t) === "schmuck");
  const guertel = [...teile, ...extras].find(t => platzVon(t) === "guertel");
  const hat = (k, v) => (s?.[k] || []).includes(v);
  const lockerOben = oben && ["locker", "oversize"].includes(oben.weite), weitUnten = unten && ["weit", "Schlag"].includes(unten.schnitt);
  if (oben && unten && lockerOben && (weitUnten || unten.bund === "hohe Taille")) o.push(`${nr(oben)} vorne leicht reinstecken, dann bleibt die Form erkennbar.`);
  else if (oben && unten?.bund === "hohe Taille") o.push(`${nr(oben)} reinstecken: Das betont die hohe Taille von ${nr(unten)}.`);
  else if (oben && unten && hat("mitte", "Oberteil gern reinstecken")) o.push(`${nr(oben)} reinstecken, so wie du es gern trägst.`);
  if (lage && ["Blazer", "Strickjacke", "Mantel"].includes(basisArt(lage))) o.push(`${nr(lage)} offen tragen: Das ergibt eine lange Linie.`);
  if (guertel && (unten || ganz)) o.push(`${nr(guertel)} an der schmalsten Stelle tragen.`);
  else if (ganz && hat("mitte", "gern betonen (Gürtel, tailliert)")) o.push(`Ein Gürtel an der schmalsten Stelle betont ${nr(ganz)}.`);
  if (oben && basisArt(oben) === "Hemd" && unten && ["Jeans", "Shorts"].includes(basisArt(unten))) o.push(`Bei ${nr(oben)} die Ärmel zweimal umschlagen, das wirkt lockerer.`);
  // Tipps statt Ausschluss: passt ein Teil nicht ganz zu „Mein Stil“, sagen, wie es trotzdem geht
  const bauch = teile.find(t => t.laenge === "bauchfrei");
  if (bauch && hat("bauchfrei", "lieber nicht")) o.push(`${nr(bauch)} ist bauchfrei: Mit hoher Taille oder offener Jacke darüber wirkt es bedeckter.`);
  if (oben?.weite === "figurnah" && hat("oben", "locker") && !hat("oben", "figurnah")) o.push(`${nr(oben)} sitzt figurnah: Eine offene Strickjacke darüber macht es lockerer.`);
  if (schmuckTeil) { const f = hauptFarbe(schmuckTeil); if (f.name) o.push(`${nr(schmuckTeil)} in ${f.name} setzt einen Akzent.`); }
  else {
    const haupt = teile.map(hauptFarbe).filter(f => f.rgb), warmeTeile = haupt.filter(warm).length;
    if (haupt.length && s?.mode !== "Herren" && !hat("schmuck", "wenig Schmuck")) o.push(warmeTeile * 2 >= haupt.length ? "Schmuck in Gold passt gut zu den warmen Farben." : "Schmuck in Silber passt gut zu den kühlen Farben.");
  }
  return o.slice(0, 3);
}

/* ---------- Welche Teile kommen infrage? ---------- */
// Hartes Nie: Papierkorb und 🚫. Ordner-Auswahl: Ein Teil kommt infrage, wenn es in mindestens einem angehakten Ordner liegt.
// Teile ohne eigenen Ordner zählen über den eigenen Knopf „Ohne Ordner“. auswahl = { angehakt: Set der Ordner-IDs, ohneOrdner: an/aus }
export function kandidaten(items, auswahl = null) {
  const moeglich = items.filter(t => !t.geloescht && !t.nichtAnziehen);
  if (!auswahl) return moeglich;
  return moeglich.filter(t => t.ordner?.length ? t.ordner.some(o => auswahl.angehakt.has(o)) : auswahl.ohneOrdner);
}
// Was braucht ein Outfit noch, wenn dieses Teil gesetzt ist? Mehrere Wege möglich (Oberteil + Unterteil oder Kleid)
const VORLAGEN = { oben: [["unten", "schuh"]], unten: [["oben", "schuh"]], ganz: [["schuh"]], lage: [["oben", "unten", "schuh"], ["ganz", "schuh"]], schuh: [["oben", "unten"], ["ganz"]] };
const GANZES_OUTFIT = [["oben", "unten", "schuh"], ["ganz", "schuh"]];
const PLATZ_NAME = { oben: "Oberteile", unten: "Unterteile", schuh: "Schuhe", ganz: "Kleider" };

/* ---------- Kombinationen zu einem Teil ---------- */
const JE_PLATZ = 10, ANZAHL = 3;
export function kombinationen(anker, alle, stil = null) {
  const platz = platzVon(anker);
  if (platz === "bade") return { kombis: [], anders: null, hinweis: "Für Bademode macht die App keine Outfit-Vorschläge." };
  const andere = alle.filter(t => t.nr !== anker.nr), nachPlatz = {};
  for (const t of andere) (nachPlatz[platzVon(t)] ||= []).push(t);
  const beste = (p, zu = [anker]) => (nachPlatz[p] || []).map(t => ({ t, w: zu.reduce((s, z) => s + paar(t, z), 0) / zu.length + stilPunkte(t, stil) * 0.2 })).sort((a, b) => b.w - a.w);
  // Alle sinnvollen Kombinationen durchrechnen. Fehlt ein Platz ganz (z. B. keine Schuhe), bleibt er offen und wird als Lücke gemeldet.
  const alleRoh = [];
  for (const vorlage of VORLAGEN[platz] || GANZES_OUTFIT) {
    const pflicht = vorlage.filter(p => p !== "schuh");
    if (pflicht.some(p => !nachPlatz[p]?.length)) continue;
    const plaetze = vorlage.filter(p => nachPlatz[p]?.length), luecken = vorlage.filter(p => !nachPlatz[p]?.length);
    const listen = plaetze.map(p => beste(p).slice(0, JE_PLATZ).map(x => x.t));
    const rechne = (i, weg) => {
      if (i === listen.length) {
        const teile = [anker, ...weg];
        alleRoh.push({ teile, luecken, stimmig: stimmig(teile), stil: stilSchnitt(teile, stil) });
        return;
      }
      for (const t of listen[i]) rechne(i + 1, [...weg, t]);
    };
    rechne(0, []);
  }
  if (!alleRoh.length) return { kombis: [], anders: null, hinweis: "Dazu fehlen im Kleiderschrank noch passende Teile." };
  // Winterpullover + Sandalen oder Bluse + Jogginghose nur zeigen, wenn es gar nichts anderes gibt
  const roh = alleRoh.filter(k => !bricht(k.teile)).length ? alleRoh.filter(k => !bricht(k.teile)) : alleRoh;
  // Reihenfolge: Stimmigkeit zuerst, „Mein Stil“ als Bonus. Nicht dreimal fast dasselbe zeigen.
  const gesamt = k => k.stimmig + k.stil * 0.3;
  const sortiert = [...roh].sort((a, b) => gesamt(b) - gesamt(a));
  // Erst Kombinationen mit ganz anderer Kleidung (Schuhe dürfen gleich sein), reicht das nicht, dann wenigstens nicht identisch.
  const kleidung = k => k.teile.slice(1).filter(t => platzVon(t) !== "schuh");
  const wahl = [];
  const auswaehlen = ok => { for (const k of sortiert) { if (wahl.length >= ANZAHL) break; if (!wahl.includes(k) && wahl.every(w => ok(k, w))) wahl.push(k); } };
  auswaehlen((k, w) => !kleidung(k).some(t => w.teile.includes(t)));
  auswaehlen((k, w) => kleidung(k).filter(t => w.teile.includes(t)).length < Math.max(1, kleidung(k).length));
  // „Mal was anderes“: stimmig, aber abseits der üblichen Vorlieben und ohne die schon gezeigten Teile, wenn möglich
  const gezeigt = new Set(wahl.flatMap(k => k.teile.slice(1)));
  const neuAnteil = k => k.teile.slice(1).filter(t => !gezeigt.has(t)).length / Math.max(1, k.teile.length - 1);
  const rest = roh.filter(k => !wahl.includes(k) && k.stimmig >= 1 && neuAnteil(k) > 0);
  const anders = rest.sort((a, b) => (neuAnteil(b) - neuAnteil(a)) || (a.stil - b.stil) || (b.stimmig - a.stimmig))[0] || null;
  const fertig = k => {
    const extras = zusaetze(k.teile, nachPlatz, stil);
    return { teile: k.teile, extras, luecken: k.luecken.map(p => PLATZ_NAME[p]), warum: warum(k.teile), tipps: tipps(k.teile, extras, stil), stimmig: k.stimmig };
  };
  const ergebnis = wahl.map(fertig);
  return { kombis: ergebnis, anders: anders && fertig(anders), hinweis: ergebnis[0].stimmig < 1 ? "Für dieses Teil findet die App noch wenig wirklich Passendes." : null };
}
// Dazu passt: je höchstens eine Lage, Tasche, Schmuck und ein Gürtel, wenn sie gut passen
function zusaetze(teile, nachPlatz, stil) {
  const da = new Set(teile.map(platzVon)), kalt = teile.every(t => !saisonVon(t).includes("Sommer") || saisonVon(t).length > 1), out = [];
  const nimm = p => {
    if (da.has(p) || !nachPlatz[p]?.length) return;
    const b = nachPlatz[p].map(t => ({ t, w: teile.reduce((s, z) => s + paar(t, z), 0) / teile.length + stilPunkte(t, stil) * 0.2 })).sort((x, y) => y.w - x.w)[0];
    if (b.w >= 1.5) out.push(b.t);
  };
  if (kalt) nimm("lage");
  if (teile.some(t => ["unten", "ganz"].includes(platzVon(t)))) nimm("guertel");
  nimm("tasche");
  if (!(stil?.schmuck || []).includes("wenig Schmuck")) nimm("schmuck");
  return out.slice(0, 3);
}

/* ---------- Kaufideen: schlicht nach Lücken ---------- */
export function kaufideen(anker, alle, stil = null) {
  const mode = stil?.mode || "beides", herren = mode === "Herren", f = hauptFarbe(anker), p = platzVon(anker), sch = schick(anker);
  const andere = alle.filter(t => t.nr !== anker.nr);
  const gute = pl => andere.some(t => platzVon(t) === pl && paar(t, anker) >= 1.5);
  const meiden = stil?.nichtFarben || [];
  // Passende neutrale Farbe: dunkles Teil → hell, warme Farbe → Camel, sonst Schwarz; ungeliebte Farben auslassen
  const neutral = (dunkel = "Weiß", warmF = "Camel", sonst = "Schwarz") => [f.rgb && f.l < 0.3 ? dunkel : warm(f) ? warmF : sonst, sonst, dunkel, warmF].find(n => !meiden.includes(n));
  const ideen = [];
  const dazu = (was, warumText) => ideen.push({ was, warum: warumText });
  const grund = (pl, name) => andere.some(t => platzVon(t) === pl) ? `Keine ${name} passen wirklich gut dazu.` : `Es fehlen noch ${name}.`;
  if (p !== "schuh" && p !== "schmuck" && p !== "tasche" && !gute("schuh")) {
    const gern = (stil?.schuhe || []).find(a => !(herren && a === "Absatzschuhe"));
    const art = gern || (sch >= 4 ? (herren ? "Flache Schuhe (z. B. Loafer)" : "Absatzschuhe") : sch <= 2.5 ? "Sneaker" : "Flache Schuhe");
    dazu(`${art} in ${neutral()}`, grund("schuh", "Schuhe"));
  }
  if (["oben", "lage", "schuh"].includes(p) && !gute("unten")) {
    const art = sch >= 4 ? "Hose" : "Jeans";
    dazu(`${art} in ${art === "Jeans" ? "Jeansblau" : neutral("Beige", "Dunkelblau", "Schwarz")}`, grund("unten", "Unterteile"));
  }
  if (["unten", "lage", "schuh"].includes(p) && !gute("oben")) {
    const art = sch >= 4 ? (herren ? "Hemd" : "Bluse") : "T-Shirt";
    dazu(`${art} in ${neutral("Weiß", "Creme", "Weiß")}`, grund("oben", "Oberteile"));
  }
  if (["unten", "ganz"].includes(p) && !andere.some(t => platzVon(t) === "guertel")) dazu(`Gürtel in ${neutral("Camel", "Camel", "Schwarz")}`, "Ein Gürtel gibt dem Outfit eine klare Linie.");
  if (!herren && !["schmuck", "tasche"].includes(p) && !andere.some(t => platzVon(t) === "schmuck") && !(stil?.schmuck || []).includes("wenig Schmuck")) {
    const metall = (stil?.schmuck || []).find(m => ["Gold", "Silber", "Roségold"].includes(m)) || (warm(f) ? "Gold" : "Silber");
    dazu(`Dezente Kette in ${metall}`, "Schmuck rundet das Outfit ab.");
  }
  if (!["tasche", "schmuck"].includes(p) && !andere.some(t => platzVon(t) === "tasche")) dazu(`Tasche in ${neutral("Camel", "Camel", "Schwarz")}`, "Eine neutrale Tasche passt zu fast allem.");
  return ideen.slice(0, 3);
}
