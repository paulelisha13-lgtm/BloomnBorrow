import test from "node:test";
import assert from "node:assert/strict";

process.env.BREVO_API_KEY = "test-key";
process.env.BREVO_SENDER_EMAIL = "sender@example.com";
process.env.SMTP_FROM_NAME = "Bloom&Borrow";
const { sendMail } = await import("../lib/mailer.js");

function mockFetch(status = 201, body = {}) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return { ok: status < 300, status, json: async () => body };
  };
  return calls;
}

test("sends through the Brevo API with the verified sender", async () => {
  const calls = mockFetch();
  await sendMail({ to: "a@example.com", subject: "Hi", html: "<p>x</p>", text: "x" });
  assert.equal(calls[0].url, "https://api.brevo.com/v3/smtp/email");
  assert.equal(calls[0].init.headers["api-key"], "test-key");
  assert.deepEqual(calls[0].body.sender, { name: "Bloom&Borrow", email: "sender@example.com" });
  assert.deepEqual(calls[0].body.to, [{ email: "a@example.com" }]);
  assert.equal(calls[0].body.htmlContent, "<p>x</p>");
});

test("inline cid images become data URIs and the file is also attached", async () => {
  const calls = mockFetch();
  await sendMail({
    to: "a@example.com", subject: "QR", html: '<img src="cid:qr">',
    attachments: [{ filename: "qr.png", content: Buffer.from("png"), contentType: "image/png", cid: "qr" }]
  });
  const body = calls[0].body;
  assert.ok(body.htmlContent.includes("data:image/png;base64,"));
  assert.ok(!body.htmlContent.includes("cid:"));
  assert.deepEqual(body.attachment, [{ name: "qr.png", content: Buffer.from("png").toString("base64") }]);
});

test("a rejected send throws with the provider's message", async () => {
  mockFetch(400, { message: "sender not verified" });
  await assert.rejects(sendMail({ to: "a@example.com", subject: "x", text: "x" }), /400.*sender not verified/);
});
