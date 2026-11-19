// Gemeinsamer Zugang zur KI für andere Teile der App als das Hinzufügen (seit 0.33, „🔍 Hab ich sowas schon?“).
// Geladen wird die KI nur an EINER Stelle (app.js, startAI): Zwei Ladevorgänge legten die Modelle zweimal in den Speicher des iPhones.
// app.js meldet sich hier an und meldet den Stand (Fortschritt, fertig, Fehler); andere Ansichten fordern die KI an und hören mit.
let starten = null, bereit = null;
let stand = { text: "", anteil: 0, fertig: false, fehler: false };
const hoerer = new Set();
export function kiStartRegistrieren(start, versprechen) { starten = start; bereit = versprechen; }
export function kiMelden(neu) { stand = { ...stand, ...neu }; for (const h of hoerer) { try { h(stand); } catch (e) { console.error(e); } } }
// hoeren(stand) bei jeder Änderung; gibt { bereit (Promise, erfüllt, sobald Fotos erkannt werden können), aus() } zurück
export function kiAnfordern(hoeren = null) {
  if (hoeren) { hoerer.add(hoeren); hoeren(stand); }
  starten?.();
  return { bereit: bereit || Promise.reject(new Error("Die KI ist nicht verfügbar.")), aus: () => { if (hoeren) hoerer.delete(hoeren); } };
}
