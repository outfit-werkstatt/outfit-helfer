// „📦 Umzugskisten“ (seit 0.32, Wunsch 19.11.2026): Kisten packen wie den Koffer, nur für den Haushalt. Jede Kiste hat einen Namen,
// auf Wunsch einen Ziel-Raum, Dinge aus dem Haushalt (über ihre Nummern) und weitere Einträge ohne Foto („Gläser“, „Bücher aus dem
// Regal“). Ein Ding liegt in höchstens einer Kiste; beim Ding und in der Suche steht dann „📦 Kiste 3“ (Wo ist die Bohrmaschine?).
// Der Ort am Ding bleibt, wie er ist. Gespeichert in meta „kisten“, kommt in die Sicherung. Texte nur per textContent/value.
import { el, fill, toast, fehlerToast, field, choice, clean, mitInfo } from "./ui.js?v=21";
import { getMeta, setMeta, dingNrText } from "./speicher.js?v=12";
import { RAEUME, dingName, dingTitel } from "./haushalt.js?v=6";

const MAX_KISTEN = 200, MAX_NAME = 30, MAX_DINGE = 300, MAX_EXTRAS = 60, MAX_EXTRA_TEXT = 60, ID = /^k[a-z0-9]{1,40}$/;
let kisten = null, waehlen = null, waehlenFuer = null; // waehlen = Set der Nummern beim „Dinge hineinlegen“ (sonst null), waehlenFuer = id der Kiste
const neueId = () => "k" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const zeit = v => typeof v === "string" && v.length < 40 && !isNaN(Date.parse(v)) ? new Date(v).toISOString() : null;

// Auch für die Sicherung (zip-ansicht.js). gibtEs = Set der Ding-Nummern, die es gibt (sonst alle lassen)
export function kistenPruefen(v, gibtEs = null) {
  const ids = new Set(), vergeben = new Set(), jetzt = new Date().toISOString();
  return (Array.isArray(v) ? v : []).slice(0, MAX_KISTEN).map((k, i) => {
    if (!k || typeof k !== "object") return null;
    let id = typeof k.id === "string" && ID.test(k.id) ? k.id : neueId();
    while (ids.has(id)) id = neueId();
    ids.add(id);
    // Jedes Ding nur in einer Kiste (die erste gewinnt)
    const nrs = (Array.isArray(k.nrs) ? k.nrs : []).filter(n => Number.isInteger(n) && n > 0 && n <= 999999 && (!gibtEs || gibtEs.has(n)) && !vergeben.has(n) && vergeben.add(n)).slice(0, MAX_DINGE);
    const extras = (Array.isArray(k.extras) ? k.extras : []).map(x => typeof x?.text === "string" ? clean(x.text).slice(0, MAX_EXTRA_TEXT) : "").filter(Boolean).slice(0, MAX_EXTRAS).map(text => ({ text }));
    return { id, name: typeof k.name === "string" && clean(k.name) ? clean(k.name).slice(0, MAX_NAME) : `Kiste ${i + 1}`,
      ziel: typeof k.ziel === "string" && clean(k.ziel) ? clean(k.ziel).slice(0, 30) : null, nrs, extras, zu: k.zu === true,
      erstellt: zeit(k.erstellt) || jetzt };
  }).filter(Boolean);
}
export async function kistenLaden() {
  if (!kisten) { try { kisten = kistenPruefen(await getMeta("kisten")); } catch (e) { console.error(e); kisten = []; } }
  return kisten;
}
const speichern = () => { const jetzt = new Date().toISOString();
  return Promise.all([setMeta("kisten", kisten), setMeta("sonstGeaendert", jetzt)]).catch(e => fehlerToast("Speichern hat nicht geklappt", e)); };
// Gezählt werden nur Dinge, die es gibt (seit 0.33.2, Durchsicht 19.11.2026: ein Ding im Papierkorb zählte noch mit, „1 Ding“ bei leerer Kiste)
const inhaltText = (k, nachNr) => { const n = k.nrs.filter(nr => nachNr.has(nr)).length;
  return [n && `${n} ${n === 1 ? "Ding" : "Dinge"}`, k.extras.length && `${k.extras.length} ${k.extras.length === 1 ? "Eintrag" : "Einträge"}`].filter(Boolean).join(" + ") || "leer"; };

// s = { v: "kisten" } (Liste) oder { v: "kiste", id }, nav = { go, back, ersetze }
export async function renderKisten(box, kopf, s, dinge, bild, nav, neuZeichnen) {
  await kistenLaden();
  const nachNr = new Map(dinge.filter(d => !d.geloescht).map(d => [d.nr, d]));
  if (s.v === "kiste") {
    const k = kisten.find(x => x.id === s.id);
    if (!k) return nav.ersetze({ v: "kisten" });
    return renderKiste(box, kopf, k, nachNr, bild, nav, neuZeichnen);
  }
  waehlen = null;
  const neu = el("button", { type: "button", class: "btn primary" }, "＋ Neue Kiste");
  neu.onclick = () => {
    if (kisten.length >= MAX_KISTEN) return toast(`Höchstens ${MAX_KISTEN} Kisten.`);
    let n = kisten.length + 1; while (kisten.some(k => k.name === `Kiste ${n}`)) n++;
    const k = { id: neueId(), name: `Kiste ${n}`, ziel: null, nrs: [], extras: [], zu: false, erstellt: new Date().toISOString() };
    kisten = [...kisten, k]; speichern(); nav.go({ v: "kiste", id: k.id });
  };
  const alleWeg = el("button", { type: "button", class: "btn" }, "Alle Kisten löschen");
  alleWeg.onclick = () => {
    if (!confirm(`Alle ${kisten.length} Kisten löschen?\n\nZum Beispiel nach dem Umzug. Die Dinge bleiben im Haushalt, nur die Kisten sind weg.`)) return;
    kisten = []; speichern(); toast("Kisten gelöscht"); neuZeichnen();
  };
  const zu = kisten.filter(k => k.zu).length;
  const karte = k => {
    const erste = k.nrs.map(n => nachNr.get(n)).filter(Boolean)[0];
    return el("button", { type: "button", class: "outfit-karte", onclick: () => nav.go({ v: "kiste", id: k.id }) },
      el("span", { class: "look" }, erste ? el("img", { src: bild(erste.vorschau), alt: "" }) : el("span", { class: "koffer-zeichen" }, "📦")),
      el("span", { class: "outfit-info" }, el("span", { class: "name" }, `${k.zu ? "✓ " : ""}${k.name}`),
        el("span", { class: "anzahl" }, [k.ziel && `→ ${k.ziel}`, inhaltText(k, nachNr), k.zu ? "zu" : "offen"].filter(Boolean).join(" · "))));
  };
  fill(box, kopf("📦 Umzugskisten", kisten.length ? `${zu} von ${kisten.length} ${kisten.length === 1 ? "Kiste" : "Kisten"} zu` : null),
    el("div", { class: "panel" },
      mitInfo(el("strong", {}, "So geht's"),
        "Leg für jede Kiste einen Eintrag an und pack Dinge aus deinem Haushalt hinein. Was kein Foto hat (z. B. Gläser, Bücher), schreibst du dazu.",
        "Schreib die Nummer der Kiste auch außen auf den Karton. Dann zeigt dir die App beim Auspacken, was wo drin ist, und die Suche im Haushalt findet „Kiste 3“."),
      el("div", { class: "actions" }, neu)),
    ...kisten.map(karte),
    kisten.length ? el("div", { class: "actions" }, alleWeg) : el("p", { class: "hint" }, "Noch keine Kisten."));
}

function renderKiste(box, kopf, k, nachNr, bild, nav, neuZeichnen) {
  if (waehlen && waehlenFuer !== k.id) waehlen = null; // eine Auswahl gilt nur für ihre Kiste
  const aendern = felder => { Object.assign(k, felder); speichern(); };
  const name = el("input", { type: "text", class: "feld-eingabe", maxLength: MAX_NAME, value: k.name, autocomplete: "off", enterKeyHint: "done", "aria-label": "Name der Kiste" });
  name.onkeydown = e => { if (e.key === "Enter") name.blur(); };
  name.onchange = () => { const n = clean(name.value).slice(0, MAX_NAME); if (!n) { name.value = k.name; return; } aendern({ name: n }); neuZeichnen(); };
  const ziel = choice({ options: RAEUME.slice(0, 6), more: RAEUME.slice(6), selected: k.ziel ? [k.ziel] : [], onChange: sel => aendern({ ziel: sel[0] || null }) });
  const zuWahl = choice({ options: ["✓ Kiste ist zu"], selected: k.zu ? ["✓ Kiste ist zu"] : [], max: 0, onChange: sel => { aendern({ zu: sel.length > 0 }); toast(sel.length ? "Kiste ist zu" : "Kiste ist wieder offen"); } });

  // Dinge in der Kiste (✕ nimmt eins heraus) oder – beim Hineinlegen – alle Dinge zum Antippen
  const drin = k.nrs.map(n => nachNr.get(n)).filter(Boolean);
  const mini = (d, zeichen, an, onclick, titel) => {
    const b = el("button", { type: "button", class: "teil mini" + (an ? " markiert" : ""), title: titel, onclick },
      el("span", { class: "bild" }, el("img", { src: bild(d.vorschau), alt: dingName(d), loading: "lazy" }), el("span", { class: "plakette" }, dingNrText(d.nr)), el("span", { class: "haken" }, zeichen)),
      el("span", { class: "text" }, dingName(d)));
    b.setAttribute("aria-pressed", an ? "true" : "false");
    return b;
  };
  let dingeTeil;
  if (waehlen) {
    // Alle Dinge im Haushalt (nicht verkauft); was in einer anderen Kiste liegt, steht dabei und wandert beim Übernehmen hierher
    const woanders = new Map(kisten.filter(x => x !== k).flatMap(x => x.nrs.map(n => [n, x.name])));
    const kandidaten = [...nachNr.values()].filter(d => d.verkauf !== "verkauft" && !d.ergaenzen).sort((a, b) => b.nr - a.nr);
    const suche = el("input", { type: "search", class: "suche", placeholder: "Suchen, z. B. Lampe", "aria-label": "Suchen", autocomplete: "off", enterKeyHint: "search" });
    const fertig = el("button", { type: "button", class: "btn primary" }, `Fertig (${waehlen.size})`);
    const kacheln = kandidaten.map(d => {
      const b = mini(d, waehlen.has(d.nr) ? "✓" : "", waehlen.has(d.nr), () => {
        waehlen.has(d.nr) ? waehlen.delete(d.nr) : waehlen.add(d.nr);
        const an = waehlen.has(d.nr); b.classList.toggle("markiert", an); b.setAttribute("aria-pressed", an); b.querySelector(".haken").textContent = an ? "✓" : "";
        fertig.textContent = `Fertig (${waehlen.size})`;
      }, woanders.has(d.nr) ? `Liegt in „${woanders.get(d.nr)}“` : "Antippen");
      if (woanders.has(d.nr)) b.append(el("span", { class: "rest" }, `in ${woanders.get(d.nr)}`));
      b.dataset.such = [d.name, d.kategorie, d.marke, d.raum, d.ort, dingNrText(d.nr)].filter(Boolean).join(" ").toLowerCase();
      return b;
    });
    suche.oninput = () => { const q = suche.value.trim().toLowerCase(); for (const b of kacheln) b.hidden = !!q && !q.split(/\s+/).every(w => b.dataset.such.includes(w)); };
    suche.onkeydown = e => { if (e.key === "Enter") suche.blur(); };
    fertig.onclick = () => {
      const nrs = [...waehlen].slice(0, MAX_DINGE);
      for (const x of kisten) if (x !== k) x.nrs = x.nrs.filter(n => !waehlen.has(n)); // jedes Ding nur in einer Kiste
      aendern({ nrs }); waehlen = null; toast(`${nrs.length} ${nrs.length === 1 ? "Ding" : "Dinge"} in „${k.name}“`); neuZeichnen();
    };
    // Noch nicht fertig eingetragene Dinge stehen hier nicht (sie haben oft noch keinen Namen) – mit Hinweis (seit 0.33.2)
    const offen = [...nachNr.values()].filter(d => d.ergaenzen).length;
    dingeTeil = el("div", { class: "panel" }, el("strong", {}, "Was kommt in die Kiste?"),
      el("p", { class: "hint" }, "Tippe die Dinge an, die hineinkommen. Liegt eins schon in einer anderen Kiste, wandert es hierher."),
      offen ? el("p", { class: "hint" }, `${offen} ${offen === 1 ? "Ding steht" : "Dinge stehen"} im Haushalt noch unter „Noch ergänzen“ und ${offen === 1 ? "erscheint" : "erscheinen"} hier, sobald du ${offen === 1 ? "es" : "sie"} fertig eingetragen hast.`) : null,
      suche, el("div", { class: "kombi-teile" }, ...kacheln),
      kandidaten.length ? null : el("p", { class: "hint" }, "Im Haushalt ist noch nichts eingetragen."),
      el("div", { class: "actions" }, el("button", { type: "button", class: "btn", onclick: () => { waehlen = null; neuZeichnen(); } }, "Abbrechen"), fertig));
  } else {
    const hinein = el("button", { type: "button", class: "btn primary" }, "＋ Dinge hineinlegen / herausnehmen");
    hinein.onclick = () => { waehlen = new Set(k.nrs); waehlenFuer = k.id; neuZeichnen(); };
    dingeTeil = el("div", { class: "panel" }, el("strong", {}, `Dinge aus dem Haushalt (${drin.length})`),
      drin.length ? el("div", { class: "kombi-teile" }, ...drin.map(d => mini(d, "", false, () => nav.go({ v: "ding", nr: d.nr }), dingTitel(d)))) : el("p", { class: "hint" }, "Noch nichts drin."),
      el("div", { class: "actions" }, hinein));
  }

  // Weitere Einträge ohne Foto
  const extraListe = el("div", { class: "extra-liste" }, ...k.extras.map((x, i) => {
    const weg = el("button", { type: "button", class: "link", "aria-label": `„${x.text}“ entfernen` }, "✕");
    weg.onclick = () => { aendern({ extras: k.extras.filter((_, j) => j !== i) }); neuZeichnen(); };
    return el("div", { class: "extra-zeile" }, el("span", {}, x.text), weg);
  }));
  const neuText = el("input", { type: "text", class: "feld-eingabe", maxLength: MAX_EXTRA_TEXT, placeholder: "z. B. Gläser, Bücher aus dem Regal", autocomplete: "off", enterKeyHint: "done", "aria-label": "Weiterer Inhalt" });
  const neuKnopf = el("button", { type: "button", class: "btn" }, "Hinzufügen");
  neuKnopf.onclick = () => {
    const text = clean(neuText.value).slice(0, MAX_EXTRA_TEXT);
    if (!text) return toast("Bitte etwas eintippen.");
    if (k.extras.length >= MAX_EXTRAS) return toast(`Höchstens ${MAX_EXTRAS} Einträge.`);
    aendern({ extras: [...k.extras, { text }] }); neuZeichnen();
  };
  neuText.onkeydown = e => { if (e.key === "Enter") neuKnopf.click(); };

  const loeschen = el("button", { type: "button", class: "btn" }, "🗑 Kiste löschen");
  loeschen.onclick = () => {
    if ((k.nrs.length || k.extras.length) && !confirm(`„${k.name}“ löschen?\n\nDie Dinge bleiben im Haushalt, nur die Kiste ist weg.`)) return;
    kisten = kisten.filter(x => x !== k); speichern(); toast("Kiste gelöscht"); nav.back();
  };
  fill(box, kopf(`📦 ${k.name}`, [k.ziel && `→ ${k.ziel}`, inhaltText(k, nachNr), k.zu ? "zu" : "offen"].filter(Boolean).join(" · ")),
    dingeTeil,
    waehlen ? null : el("div", { class: "panel" }, el("strong", {}, "Was noch drin ist"), el("p", { class: "hint" }, "Sachen ohne Foto."), extraListe, el("div", { class: "extra-neu" }, neuText, neuKnopf)),
    waehlen ? null : el("div", { class: "panel" }, field("Name der Kiste", "schreib ihn auch auf den Karton", name), field("Wohin?", "freiwillig, Raum in der neuen Wohnung", ziel.el), field("Stand", null, zuWahl.el)),
    waehlen ? null : el("div", { class: "actions" }, loeschen));
}
