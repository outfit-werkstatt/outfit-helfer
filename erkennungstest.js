// KI-Bibliothek und Modelle liegen mit auf GitHub (Ordner lib/ und models/), nichts kommt von fremden Servern.
// Bibliothek: @huggingface/transformers 3.0.2 von jsDelivr, Modelle von Hugging Face, Prüfsummen beim Kopieren verglichen.
import { env, AutoModel, AutoTokenizer, AutoProcessor, SiglipTextModel, SiglipVisionModel, RawImage } from "./lib/transformers.min.js";
env.allowRemoteModels=false;
env.allowLocalModels=true;
env.localModelPath=new URL("models/",location.href).href;
env.backends.onnx.wasm.wasmPaths=new URL("lib/",location.href).href;

/* ---------- Begriffe: deutsch für die Anzeige, englisch für die KI ---------- */
// Oberkategorie → Arten. Bewusst grob: Leder-, Jeans- und Steppjacken sind „Jacke“,
// das Material sagt den Rest. Pro Art wird „a photo of a …“ mit jedem englischen
// Namen gebildet und daraus ein Durchschnitt. Getestet mit 59 Fotos: kurze Namen, nur bei leicht
// verwechselbaren Arten (T-Shirt/Polo/Hemd) eine genauere Beschreibung dazu.
const GROUPS = [
  ["Oberteile",[
    ["T-Shirt",["t-shirt","short-sleeved t-shirt","plain crew neck t-shirt"]],["Poloshirt",["polo shirt","short-sleeved polo shirt with a collar and buttons"]],["Langarmshirt",["long-sleeved top"]],["Top",["tank top"]],
    ["Bluse",["blouse","women's shirt"]],["Hemd",["button-up shirt","long-sleeved shirt with buttons all the way down"]],["Body",["bodysuit"]],["Pullover",["sweater","knitted sweater","jumper"]],
    ["Sweatshirt / Hoodie",["sweatshirt","hoodie"]],["Strickjacke",["cardigan"]],["Weste",["vest","waistcoat"]]
  ]],
  ["Jacken & Mäntel",[["Blazer",["blazer"]],["Jacke",["jacket"]],["Mantel",["coat"]]]],
  ["Unterteile",[
    ["Jeans",["jeans"]],["Hose",["trousers","pants"]],["Leggings",["leggings"]],["Jogginghose",["sweatpants"]],
    ["Shorts",["shorts"]],["Rock",["skirt"]]
  ]],
  ["Kleider & Einteiler",[["Kleid",["dress"]],["Jumpsuit",["jumpsuit"]]]],
  ["Schuhe",[["Sneaker",["sneakers"]],["Stiefel",["boots"]],["Absatzschuhe",["high heels"]],["Flache Schuhe",["ballet flats","loafers"]],["Sandalen",["sandals"]]]],
  ["Taschen",[["Tasche",["handbag","leather handbag"]],["Rucksack",["backpack with shoulder straps"]]]],
  ["Schmuck",[["Halskette",["necklace"]],["Ohrringe",["earrings"]],["Armband",["bracelet"]],["Ring",["ring"]],["Uhr",["wristwatch"]]]],
  ["Haar",[["Haarschmuck",["hair clip","hairband"]]]],
  ["Accessoires",[["Gürtel",["belt"]],["Schal / Tuch",["scarf"]],["Hut / Mütze",["hat","beanie"]],["Sonnenbrille",["sunglasses"]],["Handschuhe",["gloves"]],["Strumpfhose",["tights"]]]],
  ["Bademode",[["Bikini / Badeanzug",["bikini","swimsuit"]]]]
];
const CATEGORIES = GROUPS.flatMap(([,arts])=>arts.map(([n,en])=>[n,en.map(e=>`a photo of a ${e}.`)]));
const GROUP_OF = new Map(GROUPS.flatMap(([g,arts])=>arts.map(([n])=>[n,g])));
const withGroup = name => `${GROUP_OF.get(name)} › ${name}`;
const MATERIALS = [
  ["Baumwolle",["a garment made of cotton","a garment made of soft cotton jersey, like a t-shirt"]],
  ["Denim / Jeansstoff",["a garment made of denim"]],
  ["Strick / Wolle",["a garment made of chunky knitted wool"]],
  ["Leder",["a garment made of smooth leather"]],
  ["Wildleder",["a garment made of suede"]],
  ["Seide / Satin",["a garment made of shiny silk or satin"]],
  ["Leinen",["a garment made of linen"]],
  ["Chiffon",["a garment made of sheer chiffon"]],
  ["Spitze",["a garment made of lace"]],
  ["Samt",["a garment made of velvet"]],
  ["Cord",["a garment made of corduroy with visible ridges"]],
  ["Tweed",["a garment made of tweed"]],
  ["Synthetik, glänzend",["a garment made of shiny synthetic fabric"]],
  ["Kunstfell / Teddy",["a garment made of faux fur or teddy fleece"]],
  ["Metall",["a piece of metal jewelry"]]
];
// Rippen, Zopfmuster und Jeansstoff hielt die KI sonst für Streifen (getestet: Muster 44 → 53 von 54)
const PATTERNS = [
  ["Einfarbig",["a plain solid-colored garment with no pattern","a garment in a single plain color",
    "a plain ribbed knit garment in one color","a plain cable knit sweater in one color","a plain denim garment in one color"]],
  ["Gestreift",["a garment with stripes"]],
  ["Kariert",["a garment with a plaid check pattern"]],
  ["Geblümt",["a garment with a floral print"]],
  ["Gepunktet",["a garment with polka dots"]],
  ["Animal-Print",["a garment with a leopard animal print"]],
  ["Aufdruck / Logo",["a garment with a large printed graphic on the front","a t-shirt with a big logo or text print"]]
];

/* ---------- Farben ---------- */
// Farben benennt FashionSigLIP selbst (getestet: 51 von 54 richtig, der frühere eigene Farb-Code nur 40).
// [deutsch, englisch für die KI, Farbe für das Kästchen in der Anzeige]
const COLORS = [
  ["Schwarz","black",[22,22,22]],["Anthrazit","charcoal grey",[66,66,70]],["Grau","grey",[128,128,128]],["Hellgrau","light grey",[190,190,192]],
  ["Weiß","white",[246,246,244]],["Creme","cream",[238,228,204]],["Beige","beige",[214,194,164]],["Taupe","taupe",[150,135,120]],
  ["Camel","camel",[190,145,95]],["Braun","brown",[110,70,42]],["Dunkelbraun","dark brown",[68,44,30]],["Khaki","khaki",[160,150,102]],
  ["Oliv","olive green",[108,108,52]],["Dunkelgrün","dark green",[30,80,52]],["Grün","green",[62,150,72]],["Mint","mint green",[170,220,190]],
  ["Türkis","turquoise",[60,180,180]],["Hellblau","light blue",[160,200,230]],["Jeansblau","denim blue",[82,110,150]],["Blau","blue",[42,82,182]],
  ["Dunkelblau","navy blue",[30,40,80]],["Lila","purple",[120,70,150]],["Flieder","lilac",[190,170,215]],["Rosa","pink",[240,182,196]],
  ["Pink","hot pink",[220,60,130]],["Rot","red",[200,32,40]],["Bordeaux","burgundy",[110,26,42]],["Koralle","coral",[240,122,100]],
  ["Orange","orange",[235,130,40]],["Senfgelb","mustard yellow",[205,165,42]],["Gelb","yellow",[245,215,62]],["Gold","gold",[200,166,82]]
];
const COLOR_TEXT = COLORS.map(([n,en])=>[n,[`a ${en} garment`]]);
const COLOR_RGB = new Map(COLORS.map(([n,,rgb])=>[n,rgb]));

/* ---------- Teil freistellen mit der Freistell-KI (U-2-Netp) ----------
   Liefert eine kleine Maske (längste Seite 96 px): 1 = Kleidungsstück, 0 = Hintergrund (Boden, Tür, Bett …). */
async function segment(canvas){
  const s=96/Math.max(canvas.width,canvas.height);
  const W=Math.max(1,Math.round(canvas.width*s)), H=Math.max(1,Math.round(canvas.height*s));
  const img=await RawImage.fromBlob(await canvasToBlob(canvas));
  const {pixel_values}=await segProcessor(img);
  const out=Object.values(await segModel({[segModel.sessions.model.inputNames[0]]:pixel_values}))[0];
  // Ausgabe auf 0…255 strecken (wie im Original-Projekt rembg), dann auf die kleine Bildgröße bringen
  const v=out.data; let lo=Infinity, hi=-Infinity; for(const x of v){ if(x<lo)lo=x; if(x>hi)hi=x; }
  const [, , mh, mw]=out.dims, g=new Uint8ClampedArray(mw*mh);
  for(let i=0;i<g.length;i++) g[i]=255*(v[i]-lo)/((hi-lo)||1);
  const m=await new RawImage(g,mw,mh,1).resize(W,H);
  const mask=new Uint8Array(W*H);
  for(let i=0;i<W*H;i++) mask[i]=m.data[i*m.channels]>=128?1:0;
  const share=mask.reduce((a,b)=>a+b,0)/(W*H);
  return {W,H,mask,ok:share>=0.02&&share<=0.97}; // nicht ok: nichts Sinnvolles gefunden, KI sieht nur das ganze Foto
}

/* ---------- Teil ausschneiden, Hintergrund hellgrau (Vorschau und ein Blick für die KI) ---------- */
function clipCanvas(canvas,seg){
  const {W,H,mask}=seg;
  const m=document.createElement("canvas"); m.width=W; m.height=H;
  const mctx=m.getContext("2d"); const md=mctx.createImageData(W,H);
  let x0=W,y0=H,x1=0,y1=0;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++) if(mask[y*W+x]){md.data[(y*W+x)*4+3]=255; if(x<x0)x0=x; if(y<y0)y0=y; if(x>x1)x1=x; if(y>y1)y1=y;}
  mctx.putImageData(md,0,0);
  const cut=document.createElement("canvas"); cut.width=canvas.width; cut.height=canvas.height;
  const cctx=cut.getContext("2d"); cctx.drawImage(canvas,0,0);
  cctx.globalCompositeOperation="destination-in"; cctx.imageSmoothingEnabled=true; cctx.drawImage(m,0,0,cut.width,cut.height);
  const sx=cut.width/W, sy=cut.height/H, pad=0.08*Math.max(x1-x0,y1-y0);
  const bx=Math.max(0,(x0-pad)*sx), by=Math.max(0,(y0-pad)*sy), bw=Math.min(cut.width,(x1+1+pad)*sx)-bx, bh=Math.min(cut.height,(y1+1+pad)*sy)-by;
  const side=Math.max(bw,bh), out=document.createElement("canvas"); out.width=out.height=Math.round(side);
  const o=out.getContext("2d"); o.fillStyle="#ebebeb"; o.fillRect(0,0,out.width,out.height);
  o.drawImage(cut,bx,by,bw,bh,(side-bw)/2,(side-bh)/2,bw,bh);
  return out;
}

/* ---------- Bild verkleinern (spart Speicher auf dem Handy) ---------- */
function loadImage(file){
  return new Promise((res,rej)=>{const url=URL.createObjectURL(file);const img=new Image();
    img.onload=()=>res({img,url}); img.onerror=()=>rej(new Error("Bild konnte nicht gelesen werden (HEIC? Dann als JPG speichern)")); img.src=url;});
}
function toCanvas(img,max=448){
  const s=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
  const c=document.createElement("canvas"); c.width=Math.round(img.naturalWidth*s); c.height=Math.round(img.naturalHeight*s);
  c.getContext("2d").drawImage(img,0,0,c.width,c.height); return c;
}
const canvasToBlob=c=>new Promise(r=>c.toBlob(r,"image/jpeg",0.9));

/* ---------- KI laden: Marqo-FashionSigLIP (auf Mode trainiert, Apache-2.0) ----------
   Vergleich mit 59 Testfotos gegen das vorherige CLIP: Art 56 statt 44, Material 27 statt 24 von 29.
   Die Begriffe sind vorab mit dem Text-Teil der KI in Zahlen übersetzt (begriffe.json, exakt gespeichert).
   Das Handy lädt darum nur den Bild-Teil: Start in Sekunden statt Minuten, 111 MB weniger Download.
   Nach jeder Änderung an den Begriffen oben: Seite lokal mit ?begriffe-erzeugen öffnen, das schreibt
   begriffe.json neu. Passt die Datei nicht zu den Begriffen, meldet die Seite einen Fehler. */
const MODEL="Marqo/marqo-fashionSigLIP", SEG_MODEL="BritishWerewolf/U-2-Netp";
const TERMS_SRC=JSON.stringify({model:MODEL,cat:CATEGORIES,mat:MATERIALS,pat:PATTERNS,col:COLOR_TEXT});
const MAKE_TERMS=new URLSearchParams(location.search).has("begriffe-erzeugen");
// Vektoren exakt (Float32) als Base64 speichern und wieder lesen
function toB64(rows){
  const f=new Float32Array(rows.length*rows[0].length); rows.forEach((r,i)=>f.set(r,i*r.length));
  const u=new Uint8Array(f.buffer); let s=""; for(let i=0;i<u.length;i+=8192) s+=String.fromCharCode(...u.subarray(i,i+8192));
  return btoa(s);
}
function fromB64(s,dim){
  const f=new Float32Array(Uint8Array.from(atob(s),c=>c.charCodeAt(0)).buffer), rows=[];
  for(let i=0;i<f.length;i+=dim) rows.push(f.subarray(i,i+dim));
  return rows;
}
const statusEl=document.getElementById("status"), bar=document.getElementById("barfill");
const files={};
let processor=null, visionModel=null, segModel=null, segProcessor=null;
const TEXT={}; // Feld -> {names, emb}
const progress_callback=p=>{
  if(p.status==="progress" && p.total){ files[p.file]={loaded:p.loaded,total:p.total};
    const L=Object.values(files).reduce((a,f)=>a+f.loaded,0), T=Object.values(files).reduce((a,f)=>a+f.total,0);
    bar.style.width=(100*L/T).toFixed(0)+"%";
    statusEl.textContent=`KI-Modell wird geladen … ${(L/1e6).toFixed(0)} von ${(T/1e6).toFixed(0)} MB`;
  }
};
function normRows(t){ // Tensor [n,d] -> Liste normierter Vektoren
  const [n,dim]=t.dims, out=[];
  for(let i=0;i<n;i++){ const v=t.data.slice(i*dim,(i+1)*dim); let s=0; for(const x of v) s+=x*x; s=Math.sqrt(s); out.push(v.map(x=>x/s)); }
  return out;
}
// Nur mit ?begriffe-erzeugen: Begriffe mit dem Text-Teil der KI umrechnen und als begriffe.json speichern
async function makeTerms(opts){
  const [tokenizer,textModel]=await Promise.all([
    AutoTokenizer.from_pretrained(MODEL,{progress_callback}),
    SiglipTextModel.from_pretrained(MODEL,{...opts,model_file_name:"text_model"})
  ]);
  statusEl.textContent="KI lernt die Begriffe …";
  for(const [field,list] of [["cat",CATEGORIES],["mat",MATERIALS],["pat",PATTERNS],["col",COLOR_TEXT]]){
    const names=[], phrases=[];
    for(const [name,ps] of list) for(const p of ps){ names.push(name); phrases.push(p); }
    // SigLIP wurde mit fester Textlänge trainiert: darum padding "max_length"
    const out=await textModel(tokenizer(phrases,{padding:"max_length",truncation:true}));
    TEXT[field]={names,emb:normRows(out.text_embeds??out.pooler_output)};
  }
  // Art: alle Sätze einer Art zu EINEM Vektor mitteln (sonst hätten Arten mit mehr Sätzen einen Vorteil)
  const {names:cn,emb:ce}=TEXT.cat, catNames=[...new Set(cn)];
  TEXT.cat={names:catNames,emb:catNames.map(n=>{
    const rows=ce.filter((_,i)=>cn[i]===n), avg=rows[0].map((_,j)=>rows.reduce((s,r)=>s+r[j],0));
    const l=Math.hypot(...avg); return avg.map(x=>x/l);
  })};
  const data={quelle:TERMS_SRC,dim:TEXT.cat.emb[0].length,felder:Object.fromEntries(
    Object.entries(TEXT).map(([f,{names,emb}])=>[f,{names,emb:toB64(emb)}]))};
  const json=JSON.stringify(data);
  // Lokal (server.ps1) direkt in den Projektordner schreiben, sonst als Datei anbieten
  const saved=location.hostname==="localhost" && (await fetch("begriffe.json",{method:"POST",body:json}).catch(()=>null))?.ok;
  const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([json],{type:"application/json"})); a.download="begriffe.json";
  a.textContent=saved?"begriffe.json gespeichert ✅":"begriffe.json herunterladen"; statusEl.after(a);
}
// Test-Schalter ?gpu=1: KI auf dem Grafikchip rechnen lassen (WebGPU). Klappt das nicht, automatisch
// zurück zum normalen Weg über den Prozessor (WASM).
const WANT_GPU=new URLSearchParams(location.search).get("gpu")==="1";
let device="wasm";
async function loadVision(dev){
  const m=await SiglipVisionModel.from_pretrained(MODEL,{progress_callback,dtype:"q8",device:dev,model_file_name:"vision_model"});
  // Probelauf mit einem kleinen grauen Bild: Fehler auf dem Grafikchip zeigen sich oft erst beim Rechnen
  const c=document.createElement("canvas"); c.width=c.height=64; c.getContext("2d").fillStyle="#888"; c.getContext("2d").fillRect(0,0,64,64);
  await m(await processor(await RawImage.fromBlob(await canvasToBlob(c))));
  return m;
}
try{
  const opts={progress_callback,dtype:"q8"};
  // Freistell-KI U-2-Netp (4,6 MB, Apache-2.0): Bild wird auf 320×320 gestreckt
  [segModel,segProcessor]=await Promise.all([
    AutoModel.from_pretrained(SEG_MODEL,{progress_callback,dtype:"fp32",config:{model_type:"custom"}}),
    AutoProcessor.from_pretrained(SEG_MODEL,{progress_callback,config:{do_normalize:true,do_pad:false,do_rescale:true,do_resize:true,
      image_mean:[0.485,0.456,0.406],image_std:[0.229,0.224,0.225],feature_extractor_type:"ImageFeatureExtractor",resample:2,
      rescale_factor:1/255,size:{width:320,height:320}}})
  ]);
  processor=await AutoProcessor.from_pretrained(MODEL,{progress_callback});
  if(WANT_GPU){
    try{
      if(!navigator.gpu || !(await navigator.gpu.requestAdapter())) throw new Error("WebGPU gibt es in diesem Browser nicht");
      visionModel=await loadVision("webgpu"); device="webgpu";
    }catch(e){ console.warn("WebGPU geht nicht, nehme WASM:",e); device="wasm (WebGPU ging nicht: "+e.message+")"; }
  }
  if(!visionModel) visionModel=await loadVision("wasm");
  if(MAKE_TERMS) await makeTerms(opts);
  else{
    const data=await (await fetch("begriffe.json",{cache:"no-cache"})).json();
    if(data.quelle!==TERMS_SRC) throw new Error("begriffe.json passt nicht zu den Begriffen der Seite. Bitte mit ?begriffe-erzeugen neu erzeugen.");
    for(const [field,{names,emb}] of Object.entries(data.felder)) TEXT[field]={names,emb:fromB64(emb,data.dim)};
  }
  // Nicht mehr gebrauchte Modelldateien (CLIP aus früheren Testversionen, Text-Teil von FashionSigLIP)
  // aus dem Speicher des Handys löschen
  if(!MAKE_TERMS) try{ const c=await caches.open("transformers-cache");
    for(const k of await c.keys()) if(k.url.includes("clip-vit-base-patch32")||k.url.includes("/onnx/text_model")) await c.delete(k); }catch{}
  bar.style.width="100%";
  statusEl.textContent="✅ KI ist bereit. Du kannst jetzt Fotos auswählen."+(WANT_GPU?` Rechenweg: ${device}`:"");
  document.getElementById("uploadLabel").classList.remove("disabled");
}catch(e){
  statusEl.textContent="❌ KI konnte nicht geladen werden: "+e.message;
  console.error(e);
}

// Wahrscheinlichkeit pro Begriff für einen Bild-Vektor (Ähnlichkeit × 100, dann Softmax)
function scoreField(imgVec,field){
  const {names,emb}=TEXT[field];
  const logits=emb.map(t=>{let s=0; for(let i=0;i<t.length;i++) s+=t[i]*imgVec[i]; return 100*s;});
  const m=Math.max(...logits), ex=logits.map(l=>Math.exp(l-m)), z=ex.reduce((a,b)=>a+b,0);
  const sum=new Map(); names.forEach((n,i)=>sum.set(n,(sum.get(n)||0)+ex[i]/z));
  return sum;
}
const top3=sum=>[...sum].map(([label,score])=>({label,score})).sort((a,b)=>b.score-a.score).slice(0,3);

// Teile liegen oft quer auf dem Boden: Bild in 4 Drehungen ansehen
function rotated(c,deg){
  const o=document.createElement("canvas"); const swap=deg%180!==0;
  o.width=swap?c.height:c.width; o.height=swap?c.width:c.height;
  const x=o.getContext("2d"); x.translate(o.width/2,o.height/2); x.rotate(deg*Math.PI/180); x.drawImage(c,-c.width/2,-c.height/2);
  return o;
}
// Blickwinkel je Angabe, getestet mit 59 Fotos: Art auf dem ganzen Foto in 4 Drehungen (Bügel, Tür, Boden helfen
// beim Einordnen), Material auf ganzem Foto + Ausschnitt, Muster und Farbe auf allen 5 Bildern.
async function analyse(full,cut){
  const views=[0,90,180,270].map(d=>rotated(full,d)).concat(cut?[cut]:[]);
  const imgs=await Promise.all(views.map(async c=>RawImage.fromBlob(await canvasToBlob(c))));
  const out=await visionModel(await processor(imgs));
  const vecs=normRows(out.image_embeds??out.pooler_output), fullVecs=vecs.slice(0,4), matVecs=[vecs[0],vecs[4]||vecs[2]];
  const avgMap=(field,vs)=>{ const tot=new Map(); for(const v of vs) for(const [n,s] of scoreField(v,field)) tot.set(n,(tot.get(n)||0)+s/vs.length); return tot; };
  const avg=(field,vs)=>top3(avgMap(field,vs));
  // Art in zwei Stufen, gemittelt über die 4 Drehungen (Teile liegen oft quer):
  // 1. Oberkategorie (Oberteile, Schuhe …) – das klappt sehr zuverlässig
  // 2. die Art innerhalb dieser Oberkategorie
  const catAvg=avgMap("cat",fullVecs), groupSum=new Map();
  for(const [n,s] of catAvg) groupSum.set(GROUP_OF.get(n),(groupSum.get(GROUP_OF.get(n))||0)+s);
  const grp=[...groupSum].sort((a,b)=>b[1]-a[1])[0][0];
  const inGroup=[...catAvg].filter(([n])=>GROUP_OF.get(n)===grp), z=inGroup.reduce((s,[,v])=>s+v,0);
  const cat=inGroup.map(([label,s])=>({label,score:s/z})).sort((a,b)=>b.score-a.score).slice(0,3);
  return {cat,mat:avg("mat",matVecs),pat:avg("pat",vecs),col:avg("col",vecs)};
}

/* ---------- Ergebnisse & Bewertung ---------- */
const judgements=[]; // {field, val}
const FIELDS=["Art","Material","Muster","Farbe"];
function judgeButtons(field){
  const j={field,val:null}; judgements.push(j);
  const wrap=document.createElement("div"); wrap.className="judge";
  const ok=document.createElement("button"); ok.textContent="✓"; ok.title="stimmt";
  const bad=document.createElement("button"); bad.textContent="✗"; bad.title="stimmt nicht";
  ok.onclick=()=>{j.val=j.val===true?null:true; ok.className=j.val===true?"on-ok":""; bad.className=""; updateSummary();};
  bad.onclick=()=>{j.val=j.val===false?null:false; bad.className=j.val===false?"on-bad":""; ok.className=""; updateSummary();};
  wrap.append(ok,bad); return wrap;
}
const pct=s=>Math.round(s*100)+" %";
const swatch=n=>`<span class="sw" style="background:rgb(${COLOR_RGB.get(n).join(",")})"></span>`;
function row(field,main,alt){
  const r=document.createElement("div"); r.className="row";
  const left=document.createElement("div");
  left.innerHTML=`<div class="k">${field}</div><div class="v">${main}</div>${alt?`<div class="alt">${alt}</div>`:""}`;
  r.append(left,judgeButtons(field)); return r;
}
function updateSummary(){
  const box=document.getElementById("summary"), t=document.getElementById("sumtable");
  box.hidden=false; t.innerHTML="";
  for(const f of FIELDS){
    const js=judgements.filter(j=>j.field===f&&j.val!==null);
    const ok=js.filter(j=>j.val).length;
    t.insertAdjacentHTML("beforeend",`<tr><td>${f}</td><td>${js.length?`${ok} von ${js.length} richtig`:"noch nicht bewertet"}</td></tr>`);
  }
}

document.getElementById("files").addEventListener("change",async ev=>{
  const list=[...ev.target.files]; ev.target.value="";
  for(const file of list){
    const card=document.createElement("div"); card.className="item";
    card.innerHTML=`<img alt=""><div><div class="status">wird analysiert …</div></div>`;
    document.getElementById("results").prepend(card);
    try{
      const {img,url}=await loadImage(file); card.querySelector("img").src=url;
      const t0=performance.now();
      const canvas=toCanvas(img);
      const seg=await segment(canvas);
      const cut=seg.ok?clipCanvas(canvas,seg):null;
      if(cut){ card.querySelector("img").src=cut.toDataURL("image/jpeg",0.85); URL.revokeObjectURL(url); } // zeigt das freigestellte Teil
      const {cat,mat,pat,col}=await analyse(canvas,cut);
      const secs=((performance.now()-t0)/1000).toFixed(1);
      // Mehrfarbige Teile: zweite Farbe zeigen, wenn die KI sie für ähnlich wahrscheinlich hält
      const cols=[col[0],...col.slice(1).filter(c=>c.score>=0.2)].slice(0,2);
      const box=card.children[1]; box.innerHTML="";
      box.append(
        row("Art",`${withGroup(cat[0].label)} <span class="alt">${pct(cat[0].score)}</span>`,`sonst: ${cat.slice(1).map(c=>`${c.label} (${pct(c.score)})`).join(", ")}`),
        row("Material",`${mat[0].label} <span class="alt">${pct(mat[0].score)}</span>`,`sonst: ${mat.slice(1).map(c=>`${c.label} (${pct(c.score)})`).join(", ")}`),
        row("Muster",`${pat[0].label} <span class="alt">${pct(pat[0].score)}</span>`,`sonst: ${pat[1].label} (${pct(pat[1].score)})`),
        row("Farbe",cols.map(c=>`${swatch(c.label)}${c.label} ${pct(c.score)}`).join(" &nbsp;"),`sonst: ${col.filter(c=>!cols.includes(c)).map(c=>`${c.label} (${pct(c.score)})`).join(", ")}`)
      );
      box.insertAdjacentHTML("beforeend",`<div class="time">Analyse: ${secs} Sekunden</div>`);
    }catch(e){
      card.children[1].innerHTML=`<div class="status">❌ ${e.message}</div>`; console.error(e);
    }
  }
  updateSummary();
});
