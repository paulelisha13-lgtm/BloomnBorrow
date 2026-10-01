import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import multer from "multer";

// Outside dist/ and never registered with express.static, so an uploaded ID
// is only ever reachable through the authenticated admin route that streams
// it back (see GET /api/admin/bookings/:id/id-document).
export const ID_DOCUMENTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "uploads", "id-documents");
fs.mkdirSync(ID_DOCUMENTS_DIR, { recursive: true });

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
