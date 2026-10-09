import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import multer from "multer";
import sharp from "sharp";

// Uploads are private. Locally they go to backend/uploads (outside dist/ and
// never registered with express.static). On hosts with an ephemeral disk
// (e.g. Render free) set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY and they go
// to a private Supabase Storage bucket instead. Either way a file is only
// reachable through the authenticated admin routes that stream it back (see
// GET /api/admin/bookings/:id/id-document).
export const ID_DOCUMENTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "uploads", "id-documents");
export const EXPENSE_RECEIPTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "uploads", "expense-receipts");
export const PAYMENT_PROOFS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "uploads", "payment-proofs");

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || "bloom-uploads";
const useRemote = Boolean(SUPABASE_URL && SUPABASE_KEY);

const LOCAL_DIRS = { "id-documents": ID_DOCUMENTS_DIR, "payment-proofs": PAYMENT_PROOFS_DIR, "expense-receipts": EXPENSE_RECEIPTS_DIR };
if (!useRemote) for (const dir of Object.values(LOCAL_DIRS)) fs.mkdirSync(dir, { recursive: true });

const MIME_BY_EXT = { ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".pdf": "application/pdf" };
const objectUrl = (kind, filename) =>
  `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(SUPABASE_BUCKET)}/${kind}/${encodeURIComponent(path.basename(filename))}`;
const authHeaders = { Authorization: `Bearer ${SUPABASE_KEY}`, apikey: SUPABASE_KEY };

// Deletes a stored upload; never throws (callers treat cleanup as best-effort).
export function removeUpload(kind, filename) {
  if (!filename) return;
  if (!useRemote) return fs.unlink(path.join(LOCAL_DIRS[kind], path.basename(filename)), () => {});
  fetch(objectUrl(kind, filename), { method: "DELETE", headers: authHeaders }).catch(() => {});
}

// Like removeUpload but awaitable: resolves true only when the file is gone
// (already missing counts), so retention jobs clear the DB reference only
// after the file is really deleted.
export async function deleteUpload(kind, filename) {
  if (!filename) return true;
  if (!useRemote) {
    try { await fs.promises.unlink(path.join(LOCAL_DIRS[kind], path.basename(filename))); return true; }
    catch (error) { return error.code === "ENOENT"; }
  }
  try {
    const res = await fetch(objectUrl(kind, filename), { method: "DELETE", headers: authHeaders });
    return res.ok || res.status === 404;
  } catch { return false; }
}

// Shrinks phone-sized photos before storing them (free storage is small).
// Strips EXIF (location data), applies orientation, caps the long side, and
// keeps the original format. Keeps the original bytes if anything fails or the
// result is not smaller, and leaves PDFs untouched.
const MAX_IMAGE_SIDE = 2000;
export async function compressImage(body, mimetype) {
  try {
    let image = sharp(body, { failOn: "none" }).rotate().resize({ width: MAX_IMAGE_SIDE, height: MAX_IMAGE_SIDE, fit: "inside", withoutEnlargement: true });
    if (mimetype === "image/jpeg") image = image.jpeg({ quality: 82, mozjpeg: true });
    else if (mimetype === "image/png") image = image.png({ compressionLevel: 9, palette: true });
    else if (mimetype === "image/webp") image = image.webp({ quality: 82 });
    else return body;
    const out = await image.toBuffer();
    return out.length < body.length ? out : body;
  } catch { return body; }
}

// Streams a stored upload to the response. Resolves false if it doesn't exist.
export async function sendUpload(res, kind, filename, { name, inline = false } = {}) {
  const base = path.basename(filename);
  const displayName = path.basename(name || base).replace(/["\r\n]/g, "_");
  if (!useRemote) {
    const filePath = path.join(LOCAL_DIRS[kind], base);
    if (!fs.existsSync(filePath)) return false;
    if (inline) res.sendFile(filePath, { headers: { "Content-Disposition": `inline; filename="${displayName}"` } });
    else res.download(filePath, displayName);
    return true;
  }
  const upstream = await fetch(objectUrl(kind, base), { headers: authHeaders });
  if (!upstream.ok) return false;
  res.set({
    "Content-Type": MIME_BY_EXT[path.extname(base).toLowerCase()] || "application/octet-stream",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${displayName}"`
  });
  res.send(Buffer.from(await upstream.arrayBuffer()));
  return true;
}

// multer storage engine for both backends: buffers the upload, compresses
// images, then writes to Supabase Storage (or backend/uploads locally). Sets
// file.filename (and file.path) like diskStorage does, so routes can pass it
// to removeUpload.
function uploadStorage(kind, extByMime) {
  return {
    _handleFile(_req, file, cb) {
      const chunks = [];
      file.stream.on("data", chunk => chunks.push(chunk));
      file.stream.on("error", cb);
      file.stream.on("end", async () => {
        try {
          const body = await compressImage(Buffer.concat(chunks), file.mimetype);
          const filename = `${crypto.randomUUID()}${extByMime[file.mimetype] || ""}`;
          if (useRemote) {
            const upstream = await fetch(objectUrl(kind, filename), {
              method: "POST",
              headers: { ...authHeaders, "Content-Type": file.mimetype, "x-upsert": "false" },
              body
            });
            if (!upstream.ok) throw new Error(`Upload storage failed (${upstream.status}).`);
          } else {
            await fs.promises.writeFile(path.join(LOCAL_DIRS[kind], filename), body);
          }
          cb(null, { filename, path: filename, size: body.length });
        } catch (error) { cb(error); }
      });
    },
    _removeFile(_req, file, cb) { removeUpload(kind, file.filename); cb(null); }
  };
}

const EXT_BY_MIME = { "image/jpeg": ".jpg", "image/png": ".png", "application/pdf": ".pdf" };

const storage = uploadStorage("id-documents", EXT_BY_MIME);

export const idDocumentUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!EXT_BY_MIME[file.mimetype]) return cb(new Error("ID document must be a JPG, PNG, or PDF file."));
    cb(null, true);
  }
}).single("id_document");

const PAYMENT_PROOF_EXTENSIONS = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
const paymentProofStorage = uploadStorage("payment-proofs", PAYMENT_PROOF_EXTENSIONS);

// Payment screenshots are private in the same way as ID documents: only an
// authenticated booking route can serve them back to staff.
export const paymentProofUpload = multer({
  storage: paymentProofStorage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!PAYMENT_PROOF_EXTENSIONS[file.mimetype]) return cb(new Error("Payment proof must be a JPG, PNG, or WebP image."));
    cb(null, true);
  }
}).single("payment_proof");

const EXPENSE_RECEIPT_EXTENSIONS = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/pdf": ".pdf" };
const expenseReceiptStorage = uploadStorage("expense-receipts", EXPENSE_RECEIPT_EXTENSIONS);

// Expense receipts are financial records: private, served back only to admin/manager.
export const expenseReceiptUpload = multer({
  storage: expenseReceiptStorage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!EXPENSE_RECEIPT_EXTENSIONS[file.mimetype]) return cb(new Error("Receipt must be a JPG, PNG, WebP, or PDF file."));
    cb(null, true);
  }
}).single("receipt");

const GCASH_QR_TYPES = new Set(["image/jpeg", "image/png"]);
export const gcashQrUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!GCASH_QR_TYPES.has(file.mimetype)) return cb(new Error("GCash QR code must be a JPG or PNG image."));
    cb(null, true);
  }
}).single("qr_code");
