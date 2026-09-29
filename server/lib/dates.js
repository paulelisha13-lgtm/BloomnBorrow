

export function parseDateOnly(value) {
  const text = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

// mysql2 returns DATE columns as JS Date objects (UTC midnight, since the pool
// uses timezone "Z"), while request bodies carry "YYYY-MM-DD" strings. Normalise
// both to "YYYY-MM-DD" so they can be compared and parsed reliably.
export function toDateOnly(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0,10);
  return String(value || "").slice(0,10);
}

export function todayDateOnly() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
}

export function rentalDays(startDate, endDate) {
  return Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
}

// Whole calendar days past the end date: returning on the end date itself is
// on time, the day after is 1 late day. Both arguments accept a Date or "YYYY-MM-DD".
export function lateDaysSince(endDate, today = todayDateOnly()) {
  const dueMs = Date.parse(toDateOnly(endDate));
  const todayMs = Date.parse(toDateOnly(today));
  if (!Number.isFinite(dueMs) || !Number.isFinite(todayMs)) return 0;
  return Math.max(0, Math.round((todayMs - dueMs) / 86400000));
}
