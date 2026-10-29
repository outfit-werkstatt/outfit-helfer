// Erkennung für die App: Marqo-FashionSigLIP (Bild-Teil) + U-2-Netp (Freistellen), alles aus lib/ und models/.
// Gleiche Begriffe und Blickwinkel wie erkennungstest.js (dort stehen die Messergebnisse), dazu Ärmel und Hosenschnitt
// (gemessen am 28.10.2026: Ärmel 35/36, Hosenschnitt 13/15 mit ganzem Foto in 4 Drehungen).
// Die englischen Begriffe sind vorab in Zahlen übersetzt (app-begriffe.json). Nach jeder Änderung an den Listen:
// lokal index.html?begriffe-erzeugen öffnen, das schreibt app-begriffe.json neu.
import { env, AutoModel, AutoTokenizer, AutoProcessor, SiglipTextModel, SiglipVisionModel, RawImage } from "./lib/transformers.min.js";
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = new URL("models/", location.href).href;
env.backends.onnx.wasm.wasmPaths = new URL("lib/", location.href).href;

/* ---------- Begriffe: deutsch für die Anzeige, englisch für die KI ---------- */
export const GROUPS = [
  ["Oberteile", [
    ["T-Shirt", ["t-shirt", "short-sleeved t-shirt", "plain crew neck t-shirt"]], ["Poloshirt", ["polo shirt", "short-sleeved polo shirt with a collar and buttons"]], ["Langarmshirt", ["long-sleeved top"]], ["Top", ["tank top"]],
    ["Bluse", ["blouse", "women's shirt"]], ["Hemd", ["button-up shirt", "long-sleeved shirt with buttons all the way down"]], ["Body", ["bodysuit"]], ["Pullover", ["sweater", "knitted sweater", "jumper"]],
    ["Sweatshirt / Hoodie", ["sweatshirt", "hoodie"]], ["Strickjacke", ["cardigan"]], ["Weste", ["vest", "waistcoat"]]
  ]],
  ["Jacken & Mäntel", [["Blazer", ["blazer"]], ["Jacke", ["jacket"]], ["Mantel", ["coat"]]]],
  ["Unterteile", [
    ["Jeans", ["jeans"]], ["Hose", ["trousers", "pants"]], ["Leggings", ["leggings"]], ["Jogginghose", ["sweatpants"]],
    ["Shorts", ["shorts"]], ["Rock", ["skirt"]]
  ]],
  ["Kleider & Einteiler", [["Kleid", ["dress"]], ["Jumpsuit", ["jumpsuit"]]]],
  ["Schuhe", [["Sneaker", ["sneakers"]], ["Stiefel", ["boots"]], ["Absatzschuhe", ["high heels"]], ["Flache Schuhe", ["ballet flats", "loafers"]], ["Sandalen", ["sandals"]]]],
  ["Taschen", [["Tasche", ["handbag", "leather handbag"]], ["Rucksack", ["backpack with shoulder straps"]]]],
  ["Schmuck", [["Halskette", ["necklace"]], ["Ohrringe", ["earrings"]], ["Armband", ["bracelet"]], ["Ring", ["ring"]], ["Uhr", ["wristwatch"]]]],
  ["Haar", [["Haarschmuck", ["hair clip", "hairband"]]]],
  ["Accessoires", [["Gürtel", ["belt"]], ["Schal / Tuch", ["scarf"]], ["Hut / Mütze", ["hat", "beanie"]], ["Sonnenbrille", ["sunglasses"]], ["Handschuhe", ["gloves"]], ["Strumpfhose", ["tights"]]]],
  ["Bademode", [["Bikini / Badeanzug", ["bikini", "swimsuit"]]]]
];
const CATEGORIES = GROUPS.flatMap(([, arts]) => arts.map(([n, en]) => [n, en.map(e => `a photo of a ${e}.`)]));
export const GROUP_OF = new Map(GROUPS.flatMap(([g, arts]) => arts.map(([n]) => [n, g])));
export const MATERIALS = [
  ["Baumwolle", ["a garment made of cotton", "a garment made of soft cotton jersey, like a t-shirt"]],
  ["Denim / Jeansstoff", ["a garment made of denim"]],
  ["Strick / Wolle", ["a garment made of chunky knitted wool"]],
  ["Leder", ["a garment made of smooth leather"]],
  ["Wildleder", ["a garment made of suede"]],
  ["Seide / Satin", ["a garment made of shiny silk or satin"]],
  ["Leinen", ["a garment made of linen"]],
  ["Chiffon", ["a garment made of sheer chiffon"]],
  ["Spitze", ["a garment made of lace"]],
  ["Samt", ["a garment made of velvet"]],
  ["Cord", ["a garment made of corduroy with visible ridges"]],
  ["Tweed", ["a garment made of tweed"]],
  ["Synthetik, glänzend", ["a garment made of shiny synthetic fabric"]],
  ["Kunstfell / Teddy", ["a garment made of faux fur or teddy fleece"]],
  ["Metall", ["a piece of metal jewelry"]]
];
export const PATTERNS = [
  ["Einfarbig", ["a plain solid-colored garment with no pattern", "a garment in a single plain color",
    "a plain ribbed knit garment in one color", "a plain cable knit sweater in one color", "a plain denim garment in one color"]],
  ["Gestreift", ["a garment with stripes"]],
  ["Kariert", ["a garment with a plaid check pattern"]],
  ["Geblümt", ["a garment with a floral print"]],
  ["Gepunktet", ["a garment with polka dots"]],
  ["Animal-Print", ["a garment with a leopard animal print"]],
  ["Aufdruck / Logo", ["a garment with a large printed graphic on the front", "a t-shirt with a big logo or text print"]]
];
// [deutsch, englisch für die KI, Farbe für das Kästchen]
export const COLORS = [
  ["Schwarz", "black", [22, 22, 22]], ["Anthrazit", "charcoal grey", [66, 66, 70]], ["Grau", "grey", [128, 128, 128]], ["Hellgrau", "light grey", [190, 190, 192]],
  ["Weiß", "white", [246, 246, 244]], ["Creme", "cream", [238, 228, 204]], ["Beige", "beige", [214, 194, 164]], ["Taupe", "taupe", [150, 135, 120]],
  ["Camel", "camel", [190, 145, 95]], ["Braun", "brown", [110, 70, 42]], ["Dunkelbraun", "dark brown", [68, 44, 30]], ["Khaki", "khaki", [160, 150, 102]],
  ["Oliv", "olive green", [108, 108, 52]], ["Dunkelgrün", "dark green", [30, 80, 52]], ["Grün", "green", [62, 150, 72]], ["Mint", "mint green", [170, 220, 190]],
  ["Türkis", "turquoise", [60, 180, 180]], ["Hellblau", "light blue", [160, 200, 230]], ["Jeansblau", "denim blue", [82, 110, 150]], ["Blau", "blue", [42, 82, 182]],
  ["Dunkelblau", "navy blue", [30, 40, 80]], ["Lila", "purple", [120, 70, 150]], ["Flieder", "lilac", [190, 170, 215]], ["Rosa", "pink", [240, 182, 196]],
  ["Pink", "hot pink", [220, 60, 130]], ["Rot", "red", [200, 32, 40]], ["Bordeaux", "burgundy", [110, 26, 42]], ["Koralle", "coral", [240, 122, 100]],
  ["Orange", "orange", [235, 130, 40]], ["Senfgelb", "mustard yellow", [205, 165, 42]], ["Gelb", "yellow", [245, 215, 62]], ["Gold", "gold", [200, 166, 82]]
];
const COLOR_TEXT = COLORS.map(([n, en]) => [n, [`a ${en} garment`]]);
// Ärmel: kurze „three-quarter“-Sätze zogen fast alles zu ¾, darum die genaueren Formulierungen
export const SLEEVES = [
  ["ärmellos", ["a sleeveless garment", "a garment with thin spaghetti straps", "a sleeveless vest"]],
  ["kurz", ["a garment with short sleeves", "a short-sleeved t-shirt"]],
  ["¾", ["a garment with elbow-length three-quarter sleeves"]],
  ["lang", ["a garment with long sleeves", "a long-sleeved top", "a garment with sleeves reaching the wrists"]]
];
export const LEGS = [
  ["eng", ["tight skinny pants", "leggings"]],
  ["gerade", ["straight leg pants", "straight leg jeans"]],
  ["weit", ["wide leg pants", "wide leg jeans"]],
  ["Schlag", ["flared pants", "bootcut pants"]]
];
// Wo welches Merkmal passt
export const HAS_SLEEVES = new Set(["Oberteile", "Jacken & Mäntel", "Kleider & Einteiler"]);
export const HAS_LEGS = new Set(["Jeans", "Hose", "Leggings", "Jogginghose"]);
export const IS_GARMENT = g => !["Schuhe", "Taschen", "Schmuck", "Haar"].includes(g);

/* ---------- Bilder ---------- */
const canvasToBlob = (c, q = 0.9) => new Promise(r => c.toBlob(r, "image/jpeg", q));
// Die Bild-Adresse (img.src) erst nach dem letzten Zeichnen freigeben: URL.revokeObjectURL(img.src)
export function loadImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => res(img);
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("Bild konnte nicht gelesen werden (HEIC? Dann als JPG speichern)")); };
    img.src = url;
  });
}
// fein = sorgfältig verkleinern (für gespeicherte Fotos). Die KI bekommt bewusst die einfache Verkleinerung,
// damit sie genau so rechnet wie bei den Messungen.
export function toCanvas(img, max, fein = false) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, s = Math.min(1, max / Math.max(w, h));
  const c = document.createElement("canvas"); c.width = Math.round(w * s); c.height = Math.round(h * s);
  const ctx = c.getContext("2d"); if (fein) ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, c.width, c.height); return c;
}
export { canvasToBlob };
function rotated(c, deg) {
  const o = document.createElement("canvas"), swap = deg % 180 !== 0;
  o.width = swap ? c.height : c.width; o.height = swap ? c.width : c.height;
  const x = o.getContext("2d"); x.translate(o.width / 2, o.height / 2); x.rotate(deg * Math.PI / 180); x.drawImage(c, -c.width / 2, -c.height / 2);
  return o;
}

/* ---------- KI laden ---------- */
const MODEL = "Marqo/marqo-fashionSigLIP", SEG_MODEL = "BritishWerewolf/U-2-Netp";
const TERMS_SRC = JSON.stringify({ model: MODEL, cat: CATEGORIES, mat: MATERIALS, pat: PATTERNS, col: COLOR_TEXT, arm: SLEEVES, bein: LEGS });
let processor, visionModel, segModel, segProcessor;
const TEXT = {};
function normRows(t) {
  const [n, dim] = t.dims, out = [];
  for (let i = 0; i < n; i++) { const v = t.data.slice(i * dim, (i + 1) * dim); let s = 0; for (const x of v) s += x * x; s = Math.sqrt(s); out.push(v.map(x => x / s)); }
  return out;
}
function toB64(rows) {
  const f = new Float32Array(rows.length * rows[0].length); rows.forEach((r, i) => f.set(r, i * r.length));
  const u = new Uint8Array(f.buffer); let s = ""; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode(...u.subarray(i, i + 8192));
  return btoa(s);
}
function fromB64(s, dim) {
  const f = new Float32Array(Uint8Array.from(atob(s), c => c.charCodeAt(0)).buffer), rows = [];
  for (let i = 0; i < f.length; i += dim) rows.push(f.subarray(i, i + dim));
  return rows;
}
// Nur lokal mit ?begriffe-erzeugen: Begriffe umrechnen und als app-begriffe.json speichern. Gibt eine Meldung zurück.
async function makeTerms(progress_callback) {
  const [tokenizer, textModel] = await Promise.all([
    AutoTokenizer.from_pretrained(MODEL, { progress_callback }),
    SiglipTextModel.from_pretrained(MODEL, { progress_callback, dtype: "q8", model_file_name: "text_model" })
  ]);
  for (const [field, list] of [["cat", CATEGORIES], ["mat", MATERIALS], ["pat", PATTERNS], ["col", COLOR_TEXT], ["arm", SLEEVES], ["bein", LEGS]]) {
    const names = [], phrases = [];
    for (const [name, ps] of list) for (const p of ps) { names.push(name); phrases.push(p); }
    const out = await textModel(tokenizer(phrases, { padding: "max_length", truncation: true }));
    TEXT[field] = { names, emb: normRows(out.text_embeds ?? out.pooler_output) };
  }
  // Art: alle Sätze einer Art zu EINEM Vektor mitteln (sonst hätten Arten mit mehr Sätzen einen Vorteil)
  const { names: cn, emb: ce } = TEXT.cat, catNames = [...new Set(cn)];
  TEXT.cat = { names: catNames, emb: catNames.map(n => {
    const rows = ce.filter((_, i) => cn[i] === n), avg = rows[0].map((_, j) => rows.reduce((s, r) => s + r[j], 0));
    const l = Math.hypot(...avg); return avg.map(x => x / l);
  }) };
  const json = JSON.stringify({ quelle: TERMS_SRC, dim: TEXT.cat.emb[0].length, felder: Object.fromEntries(
    Object.entries(TEXT).map(([f, { names, emb }]) => [f, { names, emb: toB64(emb) }])) });
  const ok = location.hostname === "localhost" && (await fetch("app-begriffe.json", { method: "POST", body: json }).catch(() => null))?.ok;
  return ok ? "app-begriffe.json gespeichert ✅" : "app-begriffe.json konnte nicht gespeichert werden (nur lokal mit server.ps1)";
}
// onProgress(Anteil 0…1, geladene MB, gesamte MB). Gibt bei ?begriffe-erzeugen eine Meldung zurück.
// Darf nach einem Fehler erneut aufgerufen werden: fertig geladene Dateien liegen im Browser-Speicher und kommen von dort.
// Bei einem Fehler steht in fehler.dateien, welche Dateien noch nicht fertig waren („Load failed“ allein sagt das nicht).
export async function loadAI(onProgress) {
  const files = {}, pending = new Set();
  const progress_callback = p => {
    if (p.status === "initiate") pending.add(p.file);
    if (p.status === "done") pending.delete(p.file);
    if (p.status === "progress" && p.total) {
      files[p.file] = { loaded: p.loaded, total: p.total };
      const L = Object.values(files).reduce((a, f) => a + f.loaded, 0), T = Object.values(files).reduce((a, f) => a + f.total, 0);
      onProgress(L / T, L / 1e6, T / 1e6);
    }
  };
  try { await loadModels(progress_callback); }
  catch (e) { const err = e instanceof Error ? e : new Error(String(e)); err.dateien = [...pending]; throw err; }
  // Nur am PC (localhost): sonst könnte ein fremder Link mit ?begriffe-erzeugen den Start der App stören
  if (location.hostname === "localhost" && new URLSearchParams(location.search).has("begriffe-erzeugen")) return makeTerms(progress_callback);
  let data;
  try { data = await (await fetch("app-begriffe.json", { cache: "no-cache" })).json(); }
  catch (e) { const err = e instanceof Error ? e : new Error(String(e)); err.dateien = ["app-begriffe.json"]; throw err; }
  if (data.quelle !== TERMS_SRC) throw new Error("app-begriffe.json passt nicht zu den Begriffen. Bitte mit ?begriffe-erzeugen neu erzeugen.");
  for (const [field, { names, emb }] of Object.entries(data.felder)) TEXT[field] = { names, emb: fromB64(emb, data.dim) };
  return null;
}
async function loadModels(progress_callback) {
  // Erst alles fertig laden, dann übernehmen. Scheitert eine Datei, die schon geladenen Modelle wieder freigeben,
  // damit ein neuer Versuch den Speicher des Handys nicht doppelt belegt.
  const results = await Promise.allSettled([
    AutoModel.from_pretrained(SEG_MODEL, { progress_callback, dtype: "fp32", config: { model_type: "custom" } }),
    AutoProcessor.from_pretrained(SEG_MODEL, { progress_callback, config: { do_normalize: true, do_pad: false, do_rescale: true, do_resize: true,
      image_mean: [0.485, 0.456, 0.406], image_std: [0.229, 0.224, 0.225], feature_extractor_type: "ImageFeatureExtractor", resample: 2,
      rescale_factor: 1 / 255, size: { width: 320, height: 320 } } }),
    AutoProcessor.from_pretrained(MODEL, { progress_callback }),
    SiglipVisionModel.from_pretrained(MODEL, { progress_callback, dtype: "q8", model_file_name: "vision_model" })
  ]);
  const failed = results.find(r => r.status === "rejected");
  if (failed) {
    for (const r of results) if (r.status === "fulfilled") try { await r.value?.dispose?.(); } catch {}
    throw failed.reason;
  }
  [segModel, segProcessor, processor, visionModel] = results.map(r => r.value);
}

/* ---------- Freistellen (U-2-Netp) ---------- */
async function segment(canvas) {
  const s = 96 / Math.max(canvas.width, canvas.height);
  const W = Math.max(1, Math.round(canvas.width * s)), H = Math.max(1, Math.round(canvas.height * s));
  const { pixel_values } = await segProcessor(await RawImage.fromBlob(await canvasToBlob(canvas)));
  const out = Object.values(await segModel({ [segModel.sessions.model.inputNames[0]]: pixel_values }))[0];
  const v = out.data; let lo = Infinity, hi = -Infinity; for (const x of v) { if (x < lo) lo = x; if (x > hi) hi = x; }
  const [, , mh, mw] = out.dims, g = new Uint8ClampedArray(mw * mh);
  for (let i = 0; i < g.length; i++) g[i] = 255 * (v[i] - lo) / ((hi - lo) || 1);
  const m = await new RawImage(g, mw, mh, 1).resize(W, H), mask = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) mask[i] = m.data[i * m.channels] >= 128 ? 1 : 0;
  const share = mask.reduce((a, b) => a + b, 0) / (W * H);
  return { W, H, mask, ok: share >= 0.02 && share <= 0.97 };
}
// Teil ausschneiden, quadratisch auf hellgrauem Grund
function clipCanvas(canvas, { W, H, mask }) {
  const m = document.createElement("canvas"); m.width = W; m.height = H;
  const mctx = m.getContext("2d"), md = mctx.createImageData(W, H);
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mask[y * W + x]) { md.data[(y * W + x) * 4 + 3] = 255; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  mctx.putImageData(md, 0, 0);
  const cut = document.createElement("canvas"); cut.width = canvas.width; cut.height = canvas.height;
  const cctx = cut.getContext("2d"); cctx.drawImage(canvas, 0, 0);
  cctx.globalCompositeOperation = "destination-in"; cctx.drawImage(m, 0, 0, cut.width, cut.height);
  const sx = cut.width / W, sy = cut.height / H, pad = 0.08 * Math.max(x1 - x0, y1 - y0);
  const bx = Math.max(0, (x0 - pad) * sx), by = Math.max(0, (y0 - pad) * sy), bw = Math.min(cut.width, (x1 + 1 + pad) * sx) - bx, bh = Math.min(cut.height, (y1 + 1 + pad) * sy) - by;
  const side = Math.max(bw, bh), out = document.createElement("canvas"); out.width = out.height = Math.round(side);
  const o = out.getContext("2d"); o.fillStyle = "#ebebeb"; o.fillRect(0, 0, out.width, out.height);
  o.drawImage(cut, bx, by, bw, bh, (side - bw) / 2, (side - bh) / 2, bw, bh);
  return out;
}

/* ---------- Erkennen ---------- */
function scoreField(imgVec, field) {
  const { names, emb } = TEXT[field];
  const logits = emb.map(t => { let s = 0; for (let i = 0; i < t.length; i++) s += t[i] * imgVec[i]; return 100 * s; });
  const m = Math.max(...logits), ex = logits.map(l => Math.exp(l - m)), z = ex.reduce((a, b) => a + b, 0);
  const sum = new Map(); names.forEach((n, i) => sum.set(n, (sum.get(n) || 0) + ex[i] / z));
  return sum;
}
const ranked = map => [...map].map(([label, score]) => ({ label, score })).sort((a, b) => b.score - a.score);
// Liefert die ausgeschnittene Vorschau (Canvas oder null) und pro Merkmal alle Begriffe sortiert nach Wahrscheinlichkeit.
// Blickwinkel wie gemessen: Art/Ärmel/Hosenschnitt ganzes Foto in 4 Drehungen, Material ganzes Foto + Ausschnitt,
// Muster und Farbe alle 5 Bilder.
export async function recognize(img) {
  const full = toCanvas(img, 448);
  const seg = await segment(full), cut = seg.ok ? clipCanvas(full, seg) : null;
  const views = [0, 90, 180, 270].map(d => rotated(full, d)).concat(cut ? [cut] : []);
  const out = await visionModel(await processor(await Promise.all(views.map(async c => RawImage.fromBlob(await canvasToBlob(c))))));
  const vecs = normRows(out.image_embeds ?? out.pooler_output), fullVecs = vecs.slice(0, 4), matVecs = [vecs[0], vecs[4] || vecs[2]];
  const avgMap = (field, vs) => { const tot = new Map(); for (const v of vs) for (const [n, s] of scoreField(v, field)) tot.set(n, (tot.get(n) || 0) + s / vs.length); return tot; };
  // Art zweistufig: erst Oberkategorie, dann Art darin
  const catAvg = avgMap("cat", fullVecs), groupSum = new Map();
  for (const [n, s] of catAvg) groupSum.set(GROUP_OF.get(n), (groupSum.get(GROUP_OF.get(n)) || 0) + s);
  const grp = ranked(groupSum)[0].label;
  const inGroup = ranked(catAvg).filter(c => GROUP_OF.get(c.label) === grp), rest = ranked(catAvg).filter(c => GROUP_OF.get(c.label) !== grp);
  // Bild-Vektor = Mittel aller Blickwinkel (Länge 1), um später doppelte Fotos zu finden (Ähnlichkeit = Skalarprodukt)
  const mean = vecs[0].map((_, j) => vecs.reduce((s, v) => s + v[j], 0)), len = Math.hypot(...mean);
  return {
    cut, vektor: Float32Array.from(mean, x => x / len),
    art: [...inGroup, ...rest],
    material: ranked(avgMap("mat", matVecs)),
    muster: ranked(avgMap("pat", vecs)),
    farbe: ranked(avgMap("col", vecs)),
    aermel: ranked(avgMap("arm", fullVecs)),
    schnitt: ranked(avgMap("bein", fullVecs))
  };
}
