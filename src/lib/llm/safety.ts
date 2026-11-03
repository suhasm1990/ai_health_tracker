/**
 * Symptoms that can mean a heart attack, stroke or cardiac arrest. Matched before any model
 * call, so the reply never depends on a provider being up or following its prompt.
 * Phrases describe symptoms, not topics: "can a tracker predict a stroke?" goes to the model.
 */
const EMERGENCY_PATTERNS: RegExp[] = [
  /\bchest\s+(pain|pains|tight\w*|pressure|discomfort|hurts?|heaviness|ache)\b/,
  /\b(pain|tightness|pressure|heaviness|squeezing)\s+in\s+(my\s+)?chest\b/,
  /\bmy\s+chest\s+(hurts|is\s+(tight|heavy|painful))\b/,
  /\b(can'?t|cannot|can not|hard to|struggling to|trouble|difficulty)\s+breath/,
  /\bshort(ness)?\s+of\s+breath\b/,
  /\b(fainted|fainting|passed\s+out|blacked\s+out|collapsed)\b/,
  /\b(face|mouth|smile)\s+(is\s+)?(drooping|droopy|numb)\b/,
  /\b(slurred|slurring)\b|\b(can'?t|trouble|difficulty)\s+(speak|speaking|talking)\b/,
  /\b(arm|leg|face|one side)\s+(is\s+|feels\s+|went\s+|has\s+gone\s+)?(numb|weak|limp)\b/,
  /\bnumb(ness)?\s+(in|on)\s+(my\s+)?(arm|face|leg|one side)\b/,
  /\bhaving\s+a\s+(heart\s+attack|stroke)\b/,
  /\b(heart|pulse)\s+(is\s+)?(racing|pounding)\b[^.?!]*\b(dizz|faint|chest|breath)/,
];

export const EMERGENCY_REPLY = `**If this is happening now, call emergency services immediately** (112 in India and Europe, 911 in the US, 999 in the UK).

- Chest pain or pressure, trouble breathing, fainting, or sudden face drooping, arm weakness or slurred speech can be signs of a heart attack or stroke.
- Don't wait to see if it passes, and don't drive yourself. If someone is with you, tell them now.
- Tracker data can't show whether this is an emergency, so I won't judge it from your numbers.

If the symptoms have passed, please see a doctor soon: they need a proper check, not a tracker review.`;

/** The fixed safety reply when the latest user message describes emergency symptoms, otherwise null. */
export function emergencyReply(text: string | undefined): string | null {
  const normalized = (text ?? "").toLowerCase().replace(/[’`]/g, "'");
  return EMERGENCY_PATTERNS.some((p) => p.test(normalized)) ? EMERGENCY_REPLY : null;
}
