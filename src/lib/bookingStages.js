// Booking "stages" are filtered views over the single bookings list: every
// booking still comes from /admin/bookings and its status decides the stage.
export const BOOKING_STAGES = [
  { key:"pending", label:"Pending", title:"Pending Bookings", statuses:["pending"] },
  { key:"approved", label:"Approved", title:"Approved Bookings", statuses:["confirmed","ready"] },
  { key:"ongoing", label:"Ongoing", title:"Ongoing Rentals", statuses:["rented","overdue"] },
  { key:"completed", label:"Completed", title:"Completed Bookings", statuses:["returned","completed"] },
  { key:"closed", label:"Cancelled / Rejected", title:"Cancelled / Rejected Bookings", statuses:["cancelled","rejected"] }
];

export const stageByKey = key => BOOKING_STAGES.find(s => s.key === key) || null;

// A rental past its end date counts as overdue even before the hourly job flips its status.
export function isOverdueBooking(b) {
  if (!b) return false;
  if (b.status === "overdue") return true;
  if (b.status !== "rented" || !b.end_date) return false;
  // The API sends dates as UTC midnight, so compare "YYYY-MM-DD" text rather than Date objects
  // (which would shift the day in timezones west of UTC).
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return String(b.end_date).slice(0, 10) < today;
}

export function stageCounts(statusCounts = {}) {
  return Object.fromEntries(BOOKING_STAGES.map(s => [s.key, s.statuses.reduce((n, st) => n + Number(statusCounts[st] || 0), 0)]));
}
