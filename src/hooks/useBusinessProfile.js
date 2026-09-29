import { useEffect, useState } from "react";
import { api } from "../lib/api";

// Business branding (name, contact, cancellation policy) for the print
// invoice, read from the same /admin/settings the emailed invoice uses.
export function useBusinessProfile() {
  const [business, setBusiness] = useState(null);
  useEffect(() => {
    let active = true;
    api("/admin/settings")
      .then(d => { if (active) setBusiness(d.settings || {}); })
      .catch(() => { /* invoice falls back to default branding */ });
    return () => { active = false; };
  }, []);
  return business;
}
