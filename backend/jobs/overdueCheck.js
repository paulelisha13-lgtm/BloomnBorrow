import { db } from "../lib/db.js";
import { addNotification } from "../lib/notifications.js";
import { sendBookingLifecycleEmail } from "../lib/bookingEmails.js";

export async function checkOverdueBookings() {
  try {
    const [due] = await db.query(`
      SELECT id, booking_no, customer_name
      FROM bookings WHERE status='rented' AND end_date < CURDATE()
    `);
    let transitioned = 0;
    for (const b of due) {
      try {
        // Claim each booking individually: the status guard means only the run
        // that actually flips it sends notices, even if staff mark it returned
        // (or a second check runs) between the SELECT above and this UPDATE.
        const [result] = await db.query("UPDATE bookings SET status='overdue' WHERE id=? AND status='rented'", [b.id]);
        if (result.affectedRows !== 1) continue;
        transitioned++;
        await db.query(
          "INSERT INTO booking_status_history(booking_id,from_status,to_status,note) VALUES(?,'rented','overdue','Auto-detected: rental past due date')",
          [b.id]
        );
        try{await addNotification({bookingId:b.id,type:"BOOKING_STATUS",title:`Booking ${b.booking_no}: Overdue`,message:`Rental for ${b.customer_name} is past due.`});}catch(error){console.error(`[OVERDUE NOTIFICATION] ${b.booking_no}:`,error.message)}
        await sendBookingLifecycleEmail({bookingId:b.id,event:"overdue"});
      } catch (e) {
        console.error(`[OVERDUE CHECK] ${b.booking_no}:`, e.message);
      }
    }
    if (transitioned > 0) console.log(`[OVERDUE CHECK] Auto-transitioned ${transitioned} booking(s) to overdue.`);
  } catch (e) {
    console.error("[OVERDUE CHECK] Error:", e.message);
  }
}
