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
