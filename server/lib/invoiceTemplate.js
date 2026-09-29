import { escHtml, peso } from "./format.js";

// Mirrors the math in src/lib/invoice.js's paymentBreakdown() so the emailed
// invoice always agrees with the one staff can print from the admin UI.
export function paymentBreakdown(booking) {
  const payments = booking?.payments || [];
  const completed = payments.filter(p => p.status === "completed");
  const sum = type => completed.filter(p => p.payment_type === type).reduce((n, p) => n + Number(p.amount || 0), 0);
  const depositDue = Number(booking?.deposit_total || 0);
  const rentalDue = Number(booking?.rental_subtotal || 0) + Number(booking?.delivery_fee || 0) + Number(booking?.other_charges || 0) - Number(booking?.discount_total || 0);
  const depositPaid = sum("deposit");
  const rentalPaid = sum("rental") + sum("delivery") + sum("other");
  const refunded = sum("refund");
  return {
    rentalDue, depositDue, rentalPaid, depositPaid, refunded,
    totalDue: rentalDue + depositDue,
    totalPaid: rentalPaid + depositPaid,
    rentalBalance: Math.max(0, rentalDue - rentalPaid),
    depositBalance: Math.max(0, depositDue - depositPaid),
    outstanding: Math.max(0, rentalDue + depositDue - rentalPaid - depositPaid)
  };
}

export const balanceStatus = (paid, due) => paid >= due && due > 0 ? "Paid" : paid > 0 ? "Partially paid" : due > 0 ? "Unpaid" : "Not required";

// Build the invoice as a standalone HTML document, suitable as an email body.
// Every interpolated value is escaped.
export function renderInvoiceHtml(booking) {
  const e = escHtml;
  const dateStr = booking.created_at
    ? new Date(booking.created_at).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })
    : "";
  const contactLines = [booking.customer_email, booking.customer_phone].filter(Boolean).map(e).join("<br/>");
  const money = value => e(peso(Number(value || 0)));
  const b = paymentBreakdown(booking);
  const items = booking.items || [];
  const itemRows = items.map(item => `<tr><td><strong>${e(item.item_name)}</strong><br/><small>${e(item.quantity)} piece(s) &times; ${money(item.daily_price)} &times; ${e(item.rental_days)} day(s)</small></td><td class="amount">${money(item.line_rental_total)}</td></tr>`).join("");
  const itemDeliveryRows = items.filter(item => Number(item.line_delivery_total || 0) > 0).map(item => `<tr><td>Delivery &mdash; ${e(item.item_name)}<br/><small>${money(item.delivery_fee_per_piece)} per piece &times; ${e(item.quantity)} piece(s)</small></td><td class="amount">${money(item.line_delivery_total)}</td></tr>`).join("");
  const totalPieces = items.reduce((n,item)=>n + Number(item.quantity || 0),0);
  const deliveryRows = itemDeliveryRows || (Number(booking.delivery_fee || 0) > 0 ? `<tr><td>Delivery<br/><small>${money(Number(booking.delivery_fee)/Math.max(1,totalPieces))} per piece &times; ${e(totalPieces)} piece(s)</small></td><td class="amount">${money(booking.delivery_fee)}</td></tr>` : "");
  const paymentRows = (booking.payments || []).map(p => `<tr><td>${e(new Date(p.created_at).toLocaleDateString("en-PH"))} &middot; ${e(String(p.payment_type).toUpperCase())} &middot; ${e(String(p.method || "cash").replace("_", " "))}<br/><small>${e(p.status)}${p.notes ? ` &middot; ${e(p.notes)}` : ""}</small></td><td class="amount ${p.payment_type === "refund" ? "refund" : ""}">${p.payment_type === "refund" ? "&minus;" : ""}${money(p.amount)}</td></tr>`).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Invoice ${e(booking.booking_no)}</title><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',sans-serif;padding:40px;color:#1a1a1a}
    .invoice{max-width:600px;margin:auto}
    .header{display:flex;justify-content:space-between;align-items:start;border-bottom:3px solid #089b9d;padding-bottom:20px;margin-bottom:24px}
    .brand h1{font-size:24px;color:#089b9d;margin-bottom:4px}
    .brand p{font-size:12px;color:#666}
    .invoice-title{text-align:right}
    .invoice-title h2{font-size:28px;color:#089b9d}
    .invoice-title p{font-size:12px;color:#666}
    .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px}
    .info-box h3{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#089b9d;margin-bottom:8px}
    .info-box p{font-size:13px;line-height:1.6}
    table{width:100%;border-collapse:collapse;margin-bottom:24px}
    th{background:#f0f9f9;padding:10px 14px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#666}
    td{padding:12px 14px;border-bottom:1px solid #eee;font-size:13px}
    .amount{text-align:right;font-weight:700}
    .totals{margin-left:auto;width:260px}
    .totals div{display:flex;justify-content:space-between;padding:8px 0;font-size:13px}
    .totals .total-row{border-top:2px solid #089b9d;padding-top:10px;margin-top:4px;font-size:16px;font-weight:800;color:#089b9d}
    .section-title{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#089b9d;margin:22px 0 8px}.status-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:18px 0}.status-card{border:1px solid #dcebea;border-radius:10px;padding:12px}.status-card small{display:block;color:#687b7b;margin-bottom:5px}.status-card strong{font-size:14px}.status-card span{display:block;font-size:11px;color:#687b7b;margin-top:4px}.refund{color:#b24350}.note{background:#f5fbfa;border-radius:8px;padding:10px 12px;font-size:11px;color:#536969;margin-top:18px}
    .footer{margin-top:40px;padding-top:16px;border-top:1px solid #ddd;text-align:center;font-size:11px;color:#888}
  </style></head><body><div class="invoice">
    <div class="header">
      <div class="brand"><h1>Bloom &amp; Borrow</h1><p>Rental Business Management System</p></div>
      <div class="invoice-title"><h2>INVOICE</h2><p>${e(booking.booking_no)}</p><p>${e(dateStr)}</p></div>
    </div>
    <div class="info-grid">
      <div class="info-box"><h3>Bill To</h3><p><strong>${e(booking.customer_name)}</strong>${contactLines ? "<br/>" + contactLines : ""}</p></div>
      <div class="info-box"><h3>Rental Period</h3><p>${e(new Date(booking.start_date).toLocaleDateString("en-PH"))} &ndash; ${e(new Date(booking.end_date).toLocaleDateString("en-PH"))}<br/>Fulfillment: <strong>${e(String(booking.fulfillment || "pickup").toUpperCase())}</strong></p></div>
    </div>
    <div class="section-title">Charges</div><table><thead><tr><th>Description</th><th class="amount">Amount</th></tr></thead><tbody>${itemRows}${deliveryRows}<tr><td>Refundable rental deposit</td><td class="amount">${money(booking.deposit_total)}</td></tr>${Number(booking.other_charges||0)?`<tr><td>Other service charges</td><td class="amount">${money(booking.other_charges)}</td></tr>`:""}${Number(booking.discount_total||0)?`<tr><td>Discount</td><td class="amount">&minus;${money(booking.discount_total)}</td></tr>`:""}</tbody></table>
    <div class="totals"><div><span>Total amount due</span><span>${money(b.totalDue)}</span></div><div><span>Amount paid</span><span>${money(b.totalPaid)}</span></div><div class="total-row"><span>Outstanding balance</span><span>${money(b.outstanding)}</span></div></div>
    <div class="section-title">Payment schedule &amp; status</div><div class="status-grid"><div class="status-card"><small>Rental &amp; service fees</small><strong>${money(b.rentalDue)} &middot; ${e(balanceStatus(b.rentalPaid,b.rentalDue))}</strong><span>${money(b.rentalPaid)} paid &middot; ${money(b.rentalBalance)} due<br/>Due on or before rental start</span></div><div class="status-card"><small>Refundable deposit</small><strong>${money(b.depositDue)} &middot; ${e(balanceStatus(b.depositPaid,b.depositDue))}</strong><span>${money(b.depositPaid)} paid &middot; ${money(b.depositBalance)} due<br/>Due before item release; settled after return</span></div></div>
    <div class="section-title">Payment activity</div><table><thead><tr><th>Transaction</th><th class="amount">Amount</th></tr></thead><tbody>${paymentRows || `<tr><td>No payments recorded</td><td class="amount">&mdash;</td></tr>`}</tbody></table>
    ${b.refunded ? `<div class="note">Deposit refunds recorded: <strong>${money(b.refunded)}</strong>. Refunds are shown separately and do not reduce rental revenue.</div>` : ""}
    <div class="footer"><p>Thank you for your business! &middot; Bloom &amp; Borrow Rental System</p></div>
  </div></body></html>`;
}
