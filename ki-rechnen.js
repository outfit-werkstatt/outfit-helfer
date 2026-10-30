// Das eigentliche Rechnen: Marqo-FashionSigLIP (Bild-Teil) + U-2-Netp (Freistellen), alles aus lib/ und models/.
// Läuft im Hintergrund (ki-arbeiter.js), nur falls das nicht geht direkt in der Seite. Darum hier kein document und
// keine Adressen relativ zur Seite. Gleiche Begriffe und Blickwinkel wie erkennungstest.js (dort stehen die Messergebnisse),
// dazu Ärmel und Hosenschnitt (gemessen am 28.10.2026: Ärmel 35/36, Hosenschnitt 13/15 mit ganzem Foto in 4 Drehungen).
// Die englischen Begriffe sind vorab in Zahlen übersetzt (app-begriffe.json).
import { env, AutoModel, AutoTokenizer, AutoProcessor, SiglipTextModel, SiglipVisionModel, RawImage } from "./lib/transformers.min.js";
import { GROUPS, GROUP_OF, MATERIALS, PATTERNS, COLORS, SLEEVES, LEGS } from "./ki-listen.js?v=1";
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = new URL("models/", import.meta.url).href;
env.backends.onnx.wasm.wasmPaths = new URL("lib/", import.meta.url).href;
const BEGRIFFE = new URL("app-begriffe.json", import.meta.url).href;

const CATEGORIES = GROUPS.flatMap(([, arts]) => arts.map(([n, en]) => [n, en.map(e => `a photo of a ${e}.`)]));
const COLOR_TEXT = COLORS.map(([n, en]) => [n, [`a ${en} garment`]]);

/* ---------- Bilder ---------- */
const canvasToBlob = (c, quality = 0.9) => c.convertToBlob({ type: "image/jpeg", quality });
function rotated(c, deg) {
  const swap = deg % 180 !== 0, o = new OffscreenCanvas(swap ? c.height : c.width, swap ? c.width : c.height);
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
  const ok = (await fetch(BEGRIFFE, { method: "POST", body: json }).catch(() => null))?.ok;
  return ok ? "app-begriffe.json gespeichert ✅" : "app-begriffe.json konnte nicht gespeichert werden (nur lokal mit server.ps1)";
}
// onProgress(Anteil 0…1, geladene MB, gesamte MB). Gibt bei erzeugen (nur lokal, siehe ki.js) eine Meldung zurück.
// Darf nach einem Fehler erneut aufgerufen werden: fertig geladene Dateien liegen im Browser-Speicher und kommen von dort.
// Bei einem Fehler steht in fehler.dateien, welche Dateien noch nicht fertig waren („Load failed“ allein sagt das nicht).
export async function loadAI(onProgress, erzeugen = false) {
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
  if (erzeugen) return makeTerms(progress_callback);
  let data;
  try { data = await (await fetch(BEGRIFFE, { cache: "no-cache" })).json(); }
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
  const m = new OffscreenCanvas(W, H);
  const mctx = m.getContext("2d"), md = mctx.createImageData(W, H);
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mask[y * W + x]) { md.data[(y * W + x) * 4 + 3] = 255; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  mctx.putImageData(md, 0, 0);
  const cut = new OffscreenCanvas(canvas.width, canvas.height);
  const cctx = cut.getContext("2d"); cctx.drawImage(canvas, 0, 0);
  cctx.globalCompositeOperation = "destination-in"; cctx.drawImage(m, 0, 0, cut.width, cut.height);
  const sx = cut.width / W, sy = cut.height / H, pad = 0.08 * Math.max(x1 - x0, y1 - y0);
  const bx = Math.max(0, (x0 - pad) * sx), by = Math.max(0, (y0 - pad) * sy), bw = Math.min(cut.width, (x1 + 1 + pad) * sx) - bx, bh = Math.min(cut.height, (y1 + 1 + pad) * sy) - by;
  const side = Math.max(bw, bh), out = new OffscreenCanvas(Math.round(side), Math.round(side));
  const o = out.getContext("2d"); o.fillStyle = "#ebebeb"; o.fillRect(0, 0, out.width, out.height);
  o.drawImage(cut, bx, by, bw, bh, (side - bw) / 2, (side - bh) / 2, bw, bh);
  m.width = m.height = cut.width = cut.height = 0; // Zeichenflächen freigeben (iOS begrenzt ihren Speicher)
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
// bild = das auf 448 px verkleinerte Foto als ImageBitmap (wird hier geschlossen).
// Liefert die ausgeschnittene Vorschau (ImageBitmap oder null) und pro Merkmal alle Begriffe sortiert nach Wahrscheinlichkeit.
// Blickwinkel wie gemessen: Art/Ärmel/Hosenschnitt ganzes Foto in 4 Drehungen, Material ganzes Foto + Ausschnitt,
// Muster und Farbe alle 5 Bilder.
export async function recognize(bild) {
  const full = new OffscreenCanvas(bild.width, bild.height);
  full.getContext("2d").drawImage(bild, 0, 0); bild.close();
  const seg = await segment(full), cut = seg.ok ? clipCanvas(full, seg) : null;
  const views = [0, 90, 180, 270].map(d => rotated(full, d)).concat(cut ? [cut] : []);
  const out = await visionModel(await processor(await Promise.all(views.map(async c => RawImage.fromBlob(await canvasToBlob(c))))));
  for (const c of views) if (c !== cut) c.width = c.height = 0;
  full.width = full.height = 0;
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
    cut: cut ? cut.transferToImageBitmap() : null, vektor: Float32Array.from(mean, x => x / len),
    art: [...inGroup, ...rest],
    material: ranked(avgMap("mat", matVecs)),
    muster: ranked(avgMap("pat", vecs)),
    farbe: ranked(avgMap("col", vecs)),
    aermel: ranked(avgMap("arm", fullVecs)),
    schnitt: ranked(avgMap("bein", fullVecs))
  };
}
