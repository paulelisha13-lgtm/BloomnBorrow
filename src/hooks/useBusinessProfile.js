import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { cachedResponse } from "../lib/responseCache";

// Business branding (name, contact, cancellation policy) for the print
// invoice. Uses the invoice-branding endpoint rather than /admin/settings,
// which stays admin-only while staff need this to print an invoice.
export function useBusinessProfile() {
  const [business, setBusiness] = useState(() => cachedResponse("/admin/invoice-branding")?.branding || null);
  useEffect(() => {
    let active = true;
    api("/admin/invoice-branding")
      .then(d => { if (active) setBusiness(d.branding || {}); })
      .catch(() => { /* invoice falls back to default branding */ });
    return () => { active = false; };
  }, []);
  return business;
}
