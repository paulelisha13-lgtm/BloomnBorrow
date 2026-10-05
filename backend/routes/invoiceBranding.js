import { Router } from "express";
import { authenticate, requireRole } from "../lib/auth.js";
import { getSettings } from "../lib/settings.js";
import { INVOICE_BRANDING_KEYS } from "../lib/invoiceTemplate.js";

const router = Router();

// Invoice branding for staff. /api/admin/settings stays admin-only, so this
// exposes only the handful of presentation fields the print invoice needs
// (name, contact, cancellation policy) rather than the whole settings object.
router.get("/api/admin/invoice-branding", authenticate, requireRole("admin","manager","staff"), async (_req,res) => {
  const branding = await getSettings(INVOICE_BRANDING_KEYS);
  res.json({ branding });
});

export default router;
