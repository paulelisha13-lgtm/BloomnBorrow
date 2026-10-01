import { escHtml, peso } from "./format.js";

export const INVOICE_BRANDING_KEYS = ["business_name", "business_email", "business_phone", "business_address", "cancellation_policy"];

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

const BRAND = "#089b9d";
const BRAND_DARK = "#057d80";
const BRAND_SOFT = "#dff5f3";
const INK = "#1a1a1a";
const MUTED = "#667b7b";
const LINE = "#e5efee";
const REFUND = "#b24350";

const STATUS_PILL = {
  confirmed: ["#e5f7f0", "#23805d"], completed: ["#e5f7f0", "#23805d"],
  ready: ["#e4f5f7", "#15758a"], returned: ["#e4f5f7", "#15758a"],
  rented: ["#e9ecfb", "#5360a9"], overdue: ["#fdeaea", "#bd4c58"],
  pending: ["#fff3d8", "#ad751e"], cancelled: ["#f1f2f2", "#6b7a7a"],
  rejected: ["#f1f2f2", "#6b7a7a"]
};
const PAYMENT_PILL = {
  unpaid: ["#fdeaea", "#bd4c58"], partial: ["#fff3d8", "#ad751e"],
  paid: ["#e5f7f0", "#23805d"], refunded: ["#f1f2f2", "#6b7a7a"]
};

const longDate = value => value ? new Date(value).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }) : "";
const shortDate = value => value ? new Date(value).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : "";
const titleCase = value => String(value || "").replace(/_/g, " ").replace(/\b\w/g, ch => ch.toUpperCase());

// Everything the HTML and the plain-text alternative both render, computed once
// so the two can never disagree.
export function buildInvoice(booking = {}, business = {}) {
  const b = paymentBreakdown(booking);
  const items = booking.items || [];
  const brand = {
    name: business.business_name || "Bloom & Borrow",
    email: business.business_email || "",
    phone: business.business_phone || "",
    address: business.business_address || ""
  };
  const totalPieces = items.reduce((n, item) => n + Number(item.quantity || 0), 0);
  const lines = [];
  for (const item of items) {
    lines.push({
      name: item.item_name,
      qty: Number(item.quantity || 0),
      rate: Number(item.daily_price || 0),
      days: Number(item.rental_days || 0),
      total: Number(item.line_rental_total || 0),
      sub: ""
    });
    if (Number(item.line_delivery_total || 0) > 0) {
      lines.push({
        name: `Delivery — ${item.item_name}`,
        qty: Number(item.quantity || 0),
        rate: Number(item.delivery_fee_per_piece || 0),
        days: 0,
        total: Number(item.line_delivery_total || 0),
        sub: "per piece"
      });
    }
  }
  if (!lines.length) {
    lines.push({ name: "No rental items on this booking", qty: 0, rate: 0, days: 0, total: 0, sub: "" });
  }
  const payments = (booking.payments || []).map(p => ({
    date: shortDate(p.created_at),
    type: titleCase(p.payment_type),
    method: titleCase(p.method || "cash"),
    ref: p.reference_no || "",
    status: p.status || "completed",
    notes: p.notes || "",
    amount: Number(p.amount || 0),
    isRefund: p.payment_type === "refund"
  }));
  const customerAddress = [
    booking.delivery_address,
    [booking.city, booking.province].filter(Boolean).join(", "),
    booking.postal_code
  ].map(x => String(x || "").trim()).filter(Boolean).join(", ");
  const totals = [];
  totals.push({ label: "Rental subtotal", value: Number(booking.rental_subtotal || 0) });
  if (Number(booking.delivery_fee || 0) > 0) totals.push({ label: "Delivery", value: Number(booking.delivery_fee) });
  if (Number(booking.other_charges || 0) > 0) totals.push({ label: "Other service charges", value: Number(booking.other_charges) });
  if (Number(booking.discount_total || 0) > 0) totals.push({ label: "Discount", value: -Number(booking.discount_total) });
  totals.push({ label: "Refundable rental deposit", value: Number(booking.deposit_total || 0) });
  return {
    b, brand, lines, totals, payments, totalPieces,
    no: booking.booking_no || "",
    issued: longDate(booking.created_at),
    startDate: longDate(booking.start_date),
    endDate: longDate(booking.end_date),
    dueOn: longDate(booking.start_date),
    status: String(booking.status || "pending"),
    paymentStatus: String(booking.payment_status || "unpaid"),
    fulfillment: titleCase(booking.fulfillment || "pickup"),
    customer: {
      name: booking.customer_name || "",
      email: booking.customer_email || "",
      phone: booking.customer_phone || "",
      address: customerAddress
    },
    notes: booking.notes || "",
    policy: business.cancellation_policy || ""
  };
}

const pill = (table, value) => {
  const [bg, fg] = table[value] || ["#f1f2f2", "#6b7a7a"];
  return `<span style="display:inline-block;background:${bg};color:${fg};font-size:10px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;padding:4px 9px;border-radius:20px;white-space:nowrap">${escHtml(value)}</span>`;
};

const cell = (content, style) => `<td style="${style}">${content}</td>`;

// Gmail ignores display:grid/flex for layout and CSS custom properties, so the
// whole invoice is nested tables with inline styles — the only layout it
// renders precisely. Do not "modernise" this into flex/grid.
export function renderInvoiceHtml(booking, business) {
  const e = escHtml;
  const d = buildInvoice(booking, business);
  const money = value => e(peso(Number(value || 0)));
  const right = "text-align:right;vertical-align:top;white-space:nowrap;font-variant-numeric:tabular-nums";
  const left = "text-align:left;vertical-align:top";
  const center = "text-align:center;vertical-align:top;white-space:nowrap";

  const lineRows = d.lines.map(row => {
    const main = `<tr>
      ${cell(row.sub ? "" : `<strong>${e(row.name)}</strong>`, left)}
      ${cell(row.sub ? `<span style="padding-left:12px;color:${MUTED};font-size:12px">${e(row.name)}</span>` : "", left)}
      ${cell(e(row.qty), center)}
      ${cell(row.sub ? `${money(row.rate)}<span style="font-size:10px;color:${MUTED}">/pc</span>` : money(row.rate), right)}
      ${cell(row.sub ? "—" : e(row.days), center)}
      ${cell(`<strong>${money(row.total)}</strong>`, right)}
    </tr>`;
    return main;
  }).join("");

  const totalRows = d.totals.map(t => `<tr>
    ${cell(`<span style="color:${MUTED}">${e(t.label)}</span>`, left + ";padding:7px 0")}
    ${cell(money(t.value), right + ";padding:7px 0;font-variant-numeric:tabular-nums")}
  </tr>`).join("");

  const paymentRows = d.payments.length ? d.payments.map(p => `<tr>
    ${cell(`<strong>${e(p.type)}</strong>${p.method ? ` <span style="color:${MUTED};font-size:11px">&middot; ${e(p.method)}</span>` : ""}${p.ref ? `<br/><span style="color:${MUTED};font-size:11px">Ref ${e(p.ref)}</span>` : ""}${p.notes ? `<br/><span style="color:${MUTED};font-size:11px">${e(p.notes)}</span>` : ""}`, left + ";padding:10px 0")}
    ${cell(p.status === "completed" ? "Completed" : "Void", center + ";padding:10px 0;font-size:11px;color:" + (p.status === "completed" ? "#23805d" : REFUND))}
    ${cell(`${p.isRefund ? "&minus;" : ""}<strong>${money(p.amount)}</strong>`, right + `;padding:10px 0;${p.isRefund ? `color:${REFUND}` : ""}`)}
  </tr>`).join("") : `<tr>${cell(`<span style="color:${MUTED}">No payments recorded yet.</span>`, left + ";padding:10px 0")}${cell("", center)}${cell("", right)}</tr>`;

  const dueAmount = peso(d.b.outstanding);
  const callout = d.b.outstanding > 0
    ? { bg: BRAND, fg: "#ffffff", label: "Amount due", value: dueAmount, note: `Please settle on or before ${d.dueOn}.` }
    : d.b.totalPaid > 0
      ? { bg: "#e5f7f0", fg: "#23805d", label: "Balance due", value: peso(0), note: "Paid in full. Thank you!" }
      : { bg: BRAND_SOFT, fg: BRAND_DARK, label: "Amount due", value: peso(d.b.totalDue), note: "No payments have been recorded yet." };

  const detailRow = (label, value) => `<tr>${cell(`<span style="display:block;font-size:10px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;color:${BRAND}">${e(label)}</span>`, left + ";padding:3px 0;width:96px;vertical-align:top")}${cell(`<span style="font-size:13px;color:${INK}">${value}</span>`, left + ";padding:3px 0")}</tr>`;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Invoice ${e(d.no)}</title></head>
<body style="margin:0;padding:0;background:#f4f7f7;-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f7f7"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border:1px solid ${LINE};border-radius:12px;overflow:hidden">

<tr><td bgcolor="${BRAND}" style="background:${BRAND};padding:26px 28px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td valign="top" style="font-size:21px;font-weight:800;color:#ffffff;letter-spacing:-.3px">${e(d.brand.name)}</td>
    <td valign="top" align="right" width="170" style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:2.5px">INVOICE</td>
  </tr><tr>
    <td valign="top" style="padding-top:6px;font-size:12px;line-height:1.7;color:#d7f2f1">${[d.brand.address, d.brand.phone, d.brand.email].filter(Boolean).map(e).join("<br/>")}</td>
    <td valign="top" align="right" width="170" style="padding-top:6px;font-size:12px;line-height:1.7;color:#d7f2f1">${d.no ? `No. ${e(d.no)}<br/>` : ""}${d.issued ? `Issued ${e(d.issued)}` : ""}</td>
  </tr></table>
</td></tr>

<tr><td style="padding:24px 28px 8px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td valign="top" width="50%" style="padding-right:12px">
      <div style="font-size:10px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;color:${BRAND};margin-bottom:8px">Bill to</div>
      <div style="font-size:14px;font-weight:700;color:${INK}">${e(d.customer.name)}</div>
      ${d.customer.address ? `<div style="font-size:12px;line-height:1.7;color:${MUTED};margin-top:3px">${e(d.customer.address)}</div>` : ""}
      ${d.customer.email ? `<div style="font-size:12px;line-height:1.7;color:${MUTED}">${e(d.customer.email)}</div>` : ""}
      ${d.customer.phone ? `<div style="font-size:12px;line-height:1.7;color:${MUTED}">${e(d.customer.phone)}</div>` : ""}
    </td>
    <td valign="top" width="50%" style="padding-left:12px">
      <div style="font-size:10px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;color:${BRAND};margin-bottom:8px">Invoice details</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${detailRow("Booking", d.no ? e(d.no) : "—")}
        ${detailRow("Issued", d.issued ? e(d.issued) : "—")}
        ${detailRow("Period", d.startDate ? `${e(d.startDate)} – ${e(d.endDate)}` : "—")}
        ${detailRow("Fulfillment", e(d.fulfillment))}
        ${detailRow("Status", `${pill(STATUS_PILL, d.status)} &nbsp;${pill(PAYMENT_PILL, d.paymentStatus)}`)}
      </table>
    </td>
  </tr></table>
</td></tr>

<tr><td style="padding:22px 28px 0">
  <div style="font-size:10px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;color:${BRAND};margin-bottom:10px">Charges</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>${cell(`<span style="font-size:10px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:${MUTED}">Item</span>`, left + ";padding:0 0 8px;border-bottom:2px solid " + BRAND)}
        ${cell(`<span style="font-size:10px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:${MUTED}">Qty</span>`, center + ";padding:0 0 8px;border-bottom:2px solid " + BRAND + ";width:44px")}
        ${cell(`<span style="font-size:10px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:${MUTED}">Rate</span>`, right + ";padding:0 0 8px;border-bottom:2px solid " + BRAND + ";width:96px")}
        ${cell(`<span style="font-size:10px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:${MUTED}">Days</span>`, center + ";padding:0 0 8px;border-bottom:2px solid " + BRAND + ";width:52px")}
        ${cell(`<span style="font-size:10px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:${MUTED}">Amount</span>`, right + ";padding:0 0 8px;border-bottom:2px solid " + BRAND + ";width:104px")}</tr>
    ${lineRows}
  </table>
</td></tr>

<tr><td style="padding:18px 28px 0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    ${totalRows}
    <tr><td colspan="2" style="padding:10px 0 0;border-top:2px solid ${BRAND}"></td></tr>
    <tr>${cell(`<span style="font-size:13px;font-weight:800;color:${INK}">Total amount due</span>`, left + ";padding:8px 0 0")}${cell(`<span style="font-size:15px;font-weight:800;color:${BRAND_DARK}">${money(d.b.totalDue)}</span>`, right + ";padding:8px 0 0")}</tr>
    <tr>${cell(`<span style="font-size:13px;color:${MUTED}">Amount paid</span>`, left + ";padding:4px 0")}${cell(`<span style="font-size:13px;color:${MUTED}">${money(d.b.totalPaid)}</span>`, right + ";padding:4px 0")}</tr>
    <tr>${cell(`<span style="font-size:15px;font-weight:800;color:${INK}">Balance due</span>`, left + ";padding:6px 0 0;border-top:1px solid " + LINE + ";" + (d.b.outstanding > 0 ? `background:${BRAND_SOFT}` : ""))}${cell(`<span style="font-size:15px;font-weight:800;color:${d.b.outstanding > 0 ? BRAND_DARK : "#23805d"}">${money(d.b.outstanding)}</span>`, right + ";padding:6px 0 0;border-top:1px solid " + LINE + ";" + (d.b.outstanding > 0 ? `background:${BRAND_SOFT}` : ""))}</tr>
  </table>
</td></tr>

<tr><td style="padding:18px 28px 0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${callout.bg};border-radius:10px"><tr>
    <td style="padding:16px 20px">
      <div style="font-size:10px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;color:${callout.fg};opacity:.85">${e(callout.label)}</div>
      <div style="font-size:26px;font-weight:800;color:${callout.fg};letter-spacing:-.5px;margin-top:2px">${e(callout.value)}</div>
      <div style="font-size:12px;color:${callout.fg};opacity:.9;margin-top:2px">${e(callout.note)}</div>
    </td>
  </tr></table>
</td></tr>

<tr><td style="padding:24px 28px 0">
  <div style="font-size:10px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;color:${BRAND};margin-bottom:10px">Payment schedule</div>
  ${[["Rental &amp; service fees", d.b.rentalDue, d.b.rentalPaid, d.b.rentalBalance, "Due on or before rental start"],
     ["Refundable deposit", d.b.depositDue, d.b.depositPaid, d.b.depositBalance, "Due before item release; settled after return"]].map(([label, due, paid, balance, hint]) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LINE};border-radius:10px;margin-bottom:10px"><tr><td style="padding:14px 16px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="font-size:12px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:${MUTED}">${label}</td>
      <td align="right" style="font-size:14px;font-weight:800;color:${INK}">${money(due)}</td>
    </tr><tr>
      <td colspan="2" style="padding-top:6px;font-size:12px;color:${MUTED}">${e(balanceStatus(paid, due))} &middot; ${money(paid)} paid &middot; <strong style="color:${INK}">${money(balance)}</strong> due</td>
    </tr><tr>
      <td colspan="2" style="padding-top:4px;font-size:11px;color:${MUTED}">${hint}</td>
    </tr></table>
  </td></tr></table>`).join("")}
</td></tr>

<tr><td style="padding:14px 28px 0">
  <div style="font-size:10px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;color:${BRAND};margin-bottom:10px">Payment activity</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>${cell(`<span style="font-size:10px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:${MUTED}">Transaction</span>`, left + ";padding:0 0 8px;border-bottom:2px solid " + BRAND)}
        ${cell(`<span style="font-size:10px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:${MUTED}">Status</span>`, center + ";padding:0 0 8px;border-bottom:2px solid " + BRAND + ";width:88px")}
        ${cell(`<span style="font-size:10px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:${MUTED}">Amount</span>`, right + ";padding:0 0 8px;border-bottom:2px solid " + BRAND + ";width:104px")}</tr>
    ${paymentRows}
  </table>
  ${d.b.refunded ? `<div style="margin-top:12px;padding:11px 14px;background:#fdf5f6;border:1px solid #f6dfe2;border-radius:8px;font-size:12px;color:#8a3a45">Deposit refunds recorded: <strong>${money(d.b.refunded)}</strong>. Refunds are shown separately and do not reduce rental revenue.</div>` : ""}
</td></tr>

${d.notes ? `<tr><td style="padding:18px 28px 0"><div style="font-size:10px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;color:${BRAND};margin-bottom:6px">Notes</div><div style="font-size:12px;line-height:1.7;color:${MUTED}">${e(d.notes)}</div></td></tr>` : ""}
${d.policy ? `<tr><td style="padding:14px 28px 0"><div style="font-size:10px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;color:${BRAND};margin-bottom:6px">Cancellation policy</div><div style="font-size:12px;line-height:1.7;color:${MUTED}">${e(d.policy)}</div></td></tr>` : ""}

<tr><td style="padding:26px 28px 24px">
  <div style="border-top:1px solid ${LINE};padding-top:16px;text-align:center;font-size:12px;color:${MUTED};line-height:1.8">
    Thank you for your business! &middot; ${e(d.brand.name)}<br/>
    ${[d.brand.phone, d.brand.email].filter(Boolean).map(e).join(" &middot; ")}
  </div>
</td></tr>

</table></td></tr></table></body></html>`;
}

// Plain-text alternative so the email stays readable if the HTML is clipped or
// blocked. Built from the same buildInvoice() model as the HTML above.
export function renderInvoiceText(booking, business) {
  const d = buildInvoice(booking, business);
  const column = rows => {
    const w1 = Math.max(...rows.map(r => String(r[0]).length));
    const w2 = Math.max(...rows.map(r => String(r[1]).length));
    return rows.map(([label, amount, note]) =>
      String(label).padEnd(w1 + 2) + String(amount).padStart(w2) + (note ? "  " + note : "")
    );
  };
  const chargeRows = d.lines.map(l => [
    l.sub ? `  ${l.name}` : l.name,
    peso(l.total),
    l.sub
      ? `${l.qty} pcs x ${peso(l.rate)} per piece`
      : `${l.qty} x ${peso(l.rate)} per day x ${l.days} day${l.days === 1 ? "" : "s"}`
  ]);
  const out = [
    d.brand.name.toUpperCase(),
    [d.brand.address, d.brand.phone, d.brand.email].filter(Boolean).join(" | "),
    "",
    `INVOICE ${d.no ? "— " + d.no : ""}`.trim(),
    `Issued: ${d.issued || "-"}`,
    `Rental period: ${d.startDate ? d.startDate + " to " + d.endDate : "-"}`,
    `Fulfillment: ${d.fulfillment}`,
    `Status: ${d.status} / ${d.paymentStatus}`,
    "",
    "BILL TO",
    d.customer.name,
    d.customer.address,
    d.customer.email,
    d.customer.phone,
    "",
    "CHARGES",
    ...column(chargeRows),
    "",
    "TOTALS",
    ...column([
      ...d.totals.map(t => [t.label, peso(t.value)]),
      ["TOTAL AMOUNT DUE", peso(d.b.totalDue)],
      ["Amount paid", peso(d.b.totalPaid)],
      ["BALANCE DUE", peso(d.b.outstanding)]
    ]),
    "",
    d.b.outstanding > 0
      ? `Amount due ${peso(d.b.outstanding)} — please settle on or before ${d.dueOn}.`
      : d.b.totalPaid > 0 ? "Balance due 0 — paid in full. Thank you!" : "No payments have been recorded yet.",
    "",
    "PAYMENT SCHEDULE",
    `Rental & service fees: ${peso(d.b.rentalDue)} — ${balanceStatus(d.b.rentalPaid, d.b.rentalDue)} (${peso(d.b.rentalPaid)} paid, ${peso(d.b.rentalBalance)} due)`,
    `Refundable deposit: ${peso(d.b.depositDue)} — ${balanceStatus(d.b.depositPaid, d.b.depositDue)} (${peso(d.b.depositPaid)} paid, ${peso(d.b.depositBalance)} due)`,
    "",
    "PAYMENT ACTIVITY",
    ...(d.payments.length
      ? column(d.payments.map(p => [
          `${p.date}  ${p.type}`,
          `${p.isRefund ? "-" : ""}${peso(p.amount)}`,
          `${p.status}${p.ref ? `  ref ${p.ref}` : ""}${p.notes ? `  ${p.notes}` : ""}`
        ]))
      : ["No payments recorded yet."]),
    d.b.refunded ? `Deposit refunds recorded: ${peso(d.b.refunded)}.` : "",
    d.notes ? `\nNOTES\n${d.notes}` : "",
    d.policy ? `\nCANCELLATION POLICY\n${d.policy}` : "",
    "",
    "Thank you for your business!",
    [d.brand.phone, d.brand.email].filter(Boolean).join(" | ")
  ];
  return out.filter(x => x !== "").join("\n");
}
