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

export async function sendMail({ to, subject, html, text, attachments }) {
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
