import { db } from "./db.js";
import { paymentStatusFor } from "./paymentStatus.js";

export async function getAvailability(conn, itemId, startDate, endDate) {
  const [[item]] = await conn.query(
    "SELECT id,name,total_quantity,status FROM rental_items WHERE id=? LIMIT 1",
    [itemId]
  );
  if (!item || item.status !== "active") return { item, available_quantity: 0, reserved_quantity: 0 };

  const [[reserved]] = await conn.query(`
    SELECT COALESCE(SUM(bi.quantity),0) AS reserved_quantity
    FROM booking_items bi
    INNER JOIN bookings b ON b.id=bi.booking_id
    WHERE bi.rental_item_id=?
      AND b.status IN ('pending','confirmed','ready','rented','overdue')
      AND b.start_date <= ?
      AND b.end_date >= ?
  `,[itemId,endDate,startDate]);

  const reservedQty = Number(reserved.reserved_quantity || 0);
  return {
    item,
    reserved_quantity: reservedQty,
    available_quantity: Math.max(0, Number(item.total_quantity) - reservedQty)
  };
}

export async function recalcPaymentStatus(bookingId, conn=db) {
  const [[booking]] = await conn.query("SELECT grand_total FROM bookings WHERE id=?",[bookingId]);
  if (!booking) return;
  const [[sum]] = await conn.query(`
    SELECT COALESCE(SUM(CASE WHEN payment_type<>'refund' THEN amount ELSE 0 END),0) AS paid_in,
           COALESCE(SUM(CASE WHEN payment_type='refund' THEN amount ELSE 0 END),0) AS refunded
    FROM payments WHERE booking_id=? AND status='completed'
  `,[bookingId]);
  const status = paymentStatusFor({ paid: sum.paid_in, refunded: sum.refunded, total: booking.grand_total });
  await conn.query("UPDATE bookings SET payment_status=? WHERE id=?",[status,bookingId]);
}

export async function bookingDetailById(id, conn=db) {
  const [[booking]] = await conn.query("SELECT * FROM bookings WHERE id=? LIMIT 1",[id]);
  if (!booking) return null;
  const [items] = await conn.query("SELECT * FROM booking_items WHERE booking_id=? ORDER BY id",[id]);
  const [history] = await conn.query(`
    SELECT h.*,u.full_name AS changed_by
    FROM booking_status_history h
    LEFT JOIN users u ON u.id=h.changed_by_user_id
    WHERE h.booking_id=? ORDER BY h.created_at
  `,[id]);
  const [payments] = await conn.query("SELECT * FROM payments WHERE booking_id=? ORDER BY created_at DESC",[id]);
  const [[inspection]] = await conn.query("SELECT * FROM return_inspections WHERE booking_id=? LIMIT 1",[id]);
  return {...booking,items,history,payments,inspection:inspection || null};
}

export const validTransitions = {
  pending:["confirmed","rejected","cancelled"],
  confirmed:["ready","cancelled"],
  ready:["rented","cancelled"],
  rented:["returned","overdue"],
  overdue:["returned"],
  returned:["completed"],
  completed:[],
  rejected:[],
  cancelled:[]
};
