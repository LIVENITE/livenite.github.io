export function money(n) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: n % 1 ? 2 : 0,
    maximumFractionDigits: 2
  }).format(n);
}

export function clock(ms) {
  return new Date(ms).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" });
}

// Accepts "1240", "1,240.50", "$1240". Returns a number rounded to cents, or null.
export function parseAmount(text) {
  const cleaned = String(text).replace(/[^0-9.]/g, "");
  if (!cleaned || cleaned.split(".").length > 2) return null;
  const n = parseFloat(cleaned);
  if (!isFinite(n) || n < 0 || n > 10000000) return null;
  return Math.round(n * 100) / 100;
}

// Firestore timestamp (or null while a save is in flight) to milliseconds.
export function toMillis(ts) {
  return ts && typeof ts.toMillis === "function" ? ts.toMillis() : null;
}

export const MIN = 60000;

export function pad(n) {
  return (n < 10 ? "0" : "") + n;
}

// "9:45 p.m." split into ["9:45", "p.m."] for the timeline.
export function clockParts(ms) {
  const s = clock(ms);
  const m = s.match(/^(\d{1,2}:\d{2})\s*(.*)$/);
  return m ? [m[1], m[2]] : [s, ""];
}

// "40 min", "1 h 5 min"
export function words(ms) {
  const m = Math.max(0, Math.ceil(ms / MIN));
  if (m >= 60) {
    const h = Math.floor(m / 60), r = m % 60;
    return h + " h" + (r ? " " + r + " min" : "");
  }
  return m + " min";
}

// "4:07", "1:02:30"
export function digits(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? h + ":" + pad(m) + ":" + pad(x) : m + ":" + pad(x);
}

// Compact countdown for the round badge: "43:12", then "1h 05" when over an hour away.
export function badgeTime(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s >= 3600) return Math.floor(s / 3600) + "h " + pad(Math.floor((s % 3600) / 60));
  return Math.floor(s / 60) + ":" + pad(s % 60);
}
