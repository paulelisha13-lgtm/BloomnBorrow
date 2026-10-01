export const peso = (value) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(value);

// Compare-at price for the "₱2,200 /day ₱2,400 Save ₱200" badge.
// Returns null unless there is a real discount to show, so a missing,
// zero, or stale original price (one at/below the current price) renders
// the plain price instead of an empty strikethrough or a negative saving.
export function discountOf(price, originalPrice) {
  const current = Number(price);
  const original = Number(originalPrice);
  if (!Number.isFinite(current) || !Number.isFinite(original)) return null;
  if (original <= current) return null;
  return { original, save: original - current };
}

// Escape a value before putting it into an HTML string. Invoice printing opens a
// new document with document.write(), which does NOT auto-escape like React does,
// so customer-controlled text (name, email, notes) must be neutralised here.
export function escHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}
