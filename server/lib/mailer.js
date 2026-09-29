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

export async function sendMail({ to, subject, html }) {
  const fromName = process.env.SMTP_FROM_NAME || "Bloom & Borrow";
  await getTransporter().sendMail({
    from: `"${fromName}" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html
  });
}
