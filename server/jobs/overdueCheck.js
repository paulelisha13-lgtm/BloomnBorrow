import { db } from "../lib/db.js";
import { addNotification } from "../lib/notifications.js";

export async function checkOverdueBookings() {
  try {
    const [result] = await db.query(`
      UPDATE bookings SET status='overdue'
      WHERE status='rented' AND end_date < CURDATE()
    `);
    if (result.changedRows > 0) {
      console.log(`[OVERDUE CHECK] Auto-transitioned ${result.changedRows} booking(s) to overdue.`);
      const [overdueBookings] = await db.query(`
        SELECT id, booking_no, customer_name, end_date
        FROM bookings WHERE status='overdue' AND updated_at >= DATE_SUB(NOW(), INTERVAL 2 MINUTE)
      `);
      for (const b of overdueBookings) {
        await db.query(
          "INSERT INTO booking_status_history(booking_id,from_status,to_status,note) VALUES(?,'rented','overdue','Auto-detected: rental past due date')",
          [b.id]
        );
        await addNotification({bookingId:b.id,type:"BOOKING_STATUS",title:`Booking ${b.booking_no}: Overdue`,message:`Rental for ${b.customer_name} is past due.`});
      }
    }
  } catch (e) {
    console.error("[OVERDUE CHECK] Error:", e.message);
  }
}
