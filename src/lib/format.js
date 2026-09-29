export const peso = (value) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(value);

// Escape a value before putting it into an HTML string. Invoice printing opens a
// new document with document.write(), which does NOT auto-escape like React does,
// so customer-controlled text (name, email, notes) must be neutralised here.
export function escHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}
