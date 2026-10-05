import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import multer from "multer";

// Uploads are private. Locally they go to backend/uploads (outside dist/ and
// never registered with express.static). On hosts with an ephemeral disk
// (e.g. Render free) set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY and they go
// to a private Supabase Storage bucket instead. Either way a file is only
// reachable through the authenticated admin routes that stream it back (see
// GET /api/admin/bookings/:id/id-document).
export const ID_DOCUMENTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "uploads", "id-documents");
export const PAYMENT_PROOFS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "uploads", "payment-proofs");

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || "bloom-uploads";
const useRemote = Boolean(SUPABASE_URL && SUPABASE_KEY);

const LOCAL_DIRS = { "id-documents": ID_DOCUMENTS_DIR, "payment-proofs": PAYMENT_PROOFS_DIR };
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

// multer storage engine that writes to Supabase Storage; sets file.filename
// (and file.path) like diskStorage does, so routes can pass it to removeUpload.
function supabaseStorage(kind, extByMime) {
  return {
    _handleFile(_req, file, cb) {
      const chunks = [];
      file.stream.on("data", chunk => chunks.push(chunk));
      file.stream.on("error", cb);
      file.stream.on("end", async () => {
        try {
          const body = Buffer.concat(chunks);
          const filename = `${crypto.randomUUID()}${extByMime[file.mimetype] || ""}`;
          const upstream = await fetch(objectUrl(kind, filename), {
            method: "POST",
            headers: { ...authHeaders, "Content-Type": file.mimetype, "x-upsert": "false" },
            body
          });
          if (!upstream.ok) throw new Error(`Upload storage failed (${upstream.status}).`);
          cb(null, { filename, path: filename, size: body.length });
        } catch (error) { cb(error); }
      });
    },
    _removeFile(_req, file, cb) { removeUpload(kind, file.filename); cb(null); }
  };
}

const EXT_BY_MIME = { "image/jpeg": ".jpg", "image/png": ".png", "application/pdf": ".pdf" };

const storage = useRemote ? supabaseStorage("id-documents", EXT_BY_MIME) : multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, ID_DOCUMENTS_DIR),
  filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${EXT_BY_MIME[file.mimetype] || ""}`)
});

export const idDocumentUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!EXT_BY_MIME[file.mimetype]) return cb(new Error("ID document must be a JPG, PNG, or PDF file."));
    cb(null, true);
  }
}).single("id_document");

const PAYMENT_PROOF_EXTENSIONS = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
const paymentProofStorage = useRemote ? supabaseStorage("payment-proofs", PAYMENT_PROOF_EXTENSIONS) : multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, PAYMENT_PROOFS_DIR),
  filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${PAYMENT_PROOF_EXTENSIONS[file.mimetype] || ""}`)
});

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

const GCASH_QR_TYPES = new Set(["image/jpeg", "image/png"]);
export const gcashQrUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!GCASH_QR_TYPES.has(file.mimetype)) return cb(new Error("GCash QR code must be a JPG or PNG image."));
    cb(null, true);
  }
}).single("qr_code");
