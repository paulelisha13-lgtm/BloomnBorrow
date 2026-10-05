import nodemailer from "nodemailer";

// Defaults match Gmail's SMTP server, so setting only SMTP_USER/SMTP_PASS (a
// Gmail address + App Password) works out of the box. Override SMTP_HOST/PORT
// to point at a different provider (SendGrid, Amazon SES, a mail relay, ...)
// without touching code.
let transporter = null;
function getTransporter() {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) {
    throw new Error("Email is not configured. Set SMTP_USER and SMTP_PASS on the server.");
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
      auth: { user, pass }
    });
  }
  return transporter;
}

// Gmail's SMTP server replaces the From display name with the sending
// account's own name, so SMTP_FROM_NAME is a hint, not a guarantee. Strip any
// address syntax from it: pasting a whole "From:" header in (which carries an
// angle-bracketed address) would otherwise produce a doubled, malformed header
// that shows up as garbage in the recipient's sender line.
export function fromDisplayName(value) {
  const cleaned = String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "Bloom & Borrow";
}

// Brevo (https://www.brevo.com) is used instead of SMTP when BREVO_API_KEY is
// set. It sends over HTTPS, which hosts that block outbound SMTP (e.g. Render's
// free plan) still allow. The sender must be a verified sender in Brevo; it
// defaults to SMTP_USER so one address can serve both transports.
const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

function toRecipients(to) {
  const list = Array.isArray(to) ? to : String(to ?? "").split(",");
  return list.map(x => String(x).trim()).filter(Boolean).map(email => ({ email }));
}

async function sendViaBrevo({ to, subject, html, text, attachments }) {
  const senderEmail = process.env.BREVO_SENDER_EMAIL || process.env.SMTP_USER;
  if (!senderEmail) throw new Error("Email is not configured. Set BREVO_SENDER_EMAIL on the server.");
  const payload = {
    sender: { name: fromDisplayName(process.env.SMTP_FROM_NAME), email: senderEmail },
    to: toRecipients(to),
    subject
  };
  let htmlContent = html;
  if (attachments?.length) {
    // Brevo has no cid: inline images, so inline ones are also embedded as
    // data: URIs (shown by most clients) and always attached as a plain file.
    for (const a of attachments) {
      const content = Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content ?? "");
      if (a.cid && htmlContent) {
        htmlContent = htmlContent.split(`cid:${a.cid}`).join(`data:${a.contentType || "image/png"};base64,${content.toString("base64")}`);
      }
    }
    payload.attachment = attachments.map(a => ({
      name: a.filename || "attachment",
      content: (Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content ?? "")).toString("base64")
    }));
  }
  if (htmlContent) payload.htmlContent = htmlContent;
  if (text) payload.textContent = text;
  if (!payload.htmlContent && !payload.textContent) payload.textContent = subject;
  const response = await fetch(BREVO_ENDPOINT, {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    let detail = "";
    try { detail = (await response.json()).message || ""; } catch {}
    throw new Error(`Email provider rejected the message (${response.status})${detail ? ": " + detail : ""}`);
  }
}

export async function sendMail({ to, subject, html, text, attachments }) {
  if (process.env.BREVO_API_KEY) return sendViaBrevo({ to, subject, html, text, attachments });
  const message = {
    from: `"${fromDisplayName(process.env.SMTP_FROM_NAME)}" <${process.env.SMTP_USER}>`,
    to,
    subject
  };
  if (html) message.html = html;
  if (text) message.text = text;
  if (attachments?.length) message.attachments = attachments;
  await getTransporter().sendMail(message);
}
