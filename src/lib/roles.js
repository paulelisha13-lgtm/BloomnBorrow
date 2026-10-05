import { getStoredUser } from "./api";

// Admins have full access. Managers have the same access except Access
// Management (users) and the Audit Log. Staff handle day-to-day work (bookings,
// payments, customers, incidents, maintenance) but not settings, users, reports,
// deletes, voids or inventory edits. The server enforces the same split.
export function isAdminUser() {
  return ["admin", "manager"].includes(getStoredUser()?.role);
}

// Only full admins can manage users and read the audit log.
export function isFullAdminUser() {
  return getStoredUser()?.role === "admin";
}

// Where a signed-in staff user should land: an intended deep link if it points
// into the admin area, otherwise the dashboard.
export function staffDestination(search) {
  const wanted = new URLSearchParams(search).get("redirect");
  return wanted && wanted.startsWith("/admin") ? wanted : "/admin";
}
