import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import multer from "multer";

// Outside dist/ and never registered with express.static, so an uploaded ID
// is only ever reachable through the authenticated admin route that streams
// it back (see GET /api/admin/bookings/:id/id-document).
export const ID_DOCUMENTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "uploads", "id-documents");
export const PAYMENT_PROOFS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "uploads", "payment-proofs");
fs.mkdirSync(ID_DOCUMENTS_DIR, { recursive: true });
fs.mkdirSync(PAYMENT_PROOFS_DIR, { recursive: true });

const EXT_BY_MIME = { "image/jpeg": ".jpg", "image/png": ".png", "application/pdf": ".pdf" };

const storage = multer.diskStorage({
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
const paymentProofStorage = multer.diskStorage({
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
