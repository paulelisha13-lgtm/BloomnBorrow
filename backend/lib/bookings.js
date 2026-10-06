import { db } from "./db.js";
import { paymentStatusFor } from "./paymentStatus.js";
import { parseDateOnly, rentalDays } from "./dates.js";

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

// Shared by the admin "Add Booking" route and the public customer-booking
// route so both land in the exact same tables/statuses through one code
// path: resolve-or-create the customer, lock+check availability per item,
// price the line items, then insert bookings/booking_items/status_history.
//
// matchExistingByEmail is for guests (no staff to pick "Existing Customer"):
// a returning email links the booking to its customer record instead of
// failing, but the saved record is never edited from guest input -- the
// booking just snapshots the details typed in this time.
export async function createBooking(conn, input, { historyNote, changedByUserId = null, idDocument = null, matchExistingByEmail = false } = {}) {
  let customer;
  let snapshot = null;
  if (input.customer_id) {
    [[customer]] = await conn.query("SELECT * FROM customers WHERE id=? FOR UPDATE", [input.customer_id]);
    if (!customer) { const error = new Error("Customer not found."); error.statusCode = 404; throw error; }
    if (customer.status === "blocked") { const error = new Error("This customer is blocked and cannot make new bookings."); error.statusCode = 409; throw error; }
  } else {
    const [[duplicate]] = await conn.query("SELECT * FROM customers WHERE email=? LIMIT 1 FOR UPDATE", [input.email]);
    if (duplicate && matchExistingByEmail) {
      // Deliberately vague: don't confirm to a guest that the email is on file.
      if (duplicate.status === "blocked") { const error = new Error("We can't process this request online. Please contact us to book."); error.statusCode = 403; throw error; }
      customer = duplicate;
      snapshot = {
        full_name: input.full_name, phone: input.phone, city: input.city || null,
        address: input.address || null, province: input.province || null, postal_code: input.postal_code || null
      };
    } else if (duplicate) { const error = new Error("A customer with this email already exists. Choose Existing Customer and select that record."); error.statusCode = 409; throw error; }
  }
  if (!customer) {
    const [customerResult] = await conn.query(`
      INSERT INTO customers(full_name,email,phone,city,address,province,postal_code,status)
      VALUES(?,?,?,?,?,?,?,'active')
    `, [input.full_name, input.email, input.phone, input.city || null, input.address || null, input.province || null, input.postal_code || null]);
    [[customer]] = await conn.query("SELECT * FROM customers WHERE id=?", [customerResult.insertId]);
  }
  // What this booking records: the guest's typed details for a matched
  // returning customer, otherwise the customer record itself.
  const contact = snapshot ? { ...customer, ...snapshot } : customer;
  if (input.fulfillment === "delivery" && !String(contact.address || "").trim()) { const error = new Error("This customer needs a complete delivery address before booking."); error.statusCode = 400; throw error; }
  if (new Set(input.items.map(x => x.item_id)).size !== input.items.length) { const error = new Error("Add each rental item only once; adjust its quantity instead."); error.statusCode = 400; throw error; }

  const start = parseDateOnly(input.start_date);
  const end = parseDateOnly(input.end_date);
  const days = rentalDays(start, end);
  const normalized = [];
  let rentalSubtotal = 0;
  let depositTotal = 0;
  let deliveryFee = 0;

  for (const row of input.items) {
    const [[item]] = await conn.query("SELECT * FROM rental_items WHERE id=? FOR UPDATE", [row.item_id]);
    if (!item || item.status !== "active") {
      const error = new Error("One of the selected rental items is unavailable."); error.statusCode = 409; throw error;
    }
    const availability = await getAvailability(conn, row.item_id, input.start_date, input.end_date);
    if (availability.available_quantity < row.quantity) {
      const error = new Error(`${item.name} only has ${availability.available_quantity} available for the selected dates.`); error.statusCode = 409; throw error;
    }
    const dailyPrice = Number(item.daily_price);
    const deposit = Number(item.security_deposit);
    const feePerPiece = input.fulfillment === "delivery" ? Number(row.delivery_fee_per_piece) : 0;
    const lineRental = dailyPrice * row.quantity * days;
    const lineDeposit = deposit * row.quantity;
    const lineDelivery = feePerPiece * row.quantity;
    rentalSubtotal += lineRental; depositTotal += lineDeposit; deliveryFee += lineDelivery;
    normalized.push({ item, quantity: row.quantity, dailyPrice, deposit, feePerPiece, lineRental, lineDeposit, lineDelivery });
  }

  const grandTotal = rentalSubtotal + depositTotal + deliveryFee;
  const [result] = await conn.query(`
    INSERT INTO bookings
      (customer_id,customer_name,customer_email,customer_phone,city,delivery_address,province,postal_code,start_date,end_date,
       fulfillment,payment_method,payment_status,status,rental_subtotal,deposit_total,delivery_fee,grand_total,notes,id_document_path,id_document_original_name)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'unpaid','pending',?,?,?,?,?,?,?)
  `, [customer.id, contact.full_name, contact.email, contact.phone, contact.city, contact.address, contact.province, contact.postal_code,
     input.start_date, input.end_date, input.fulfillment, input.payment_method, rentalSubtotal, depositTotal, deliveryFee, grandTotal, input.notes || null,
     idDocument?.path || null, idDocument?.originalName || null]);
  const bookingId = result.insertId;
  const bookingNo = `RF-${String(bookingId).padStart(6, "0")}`;
  await conn.query("UPDATE bookings SET booking_no=? WHERE id=?", [bookingNo, bookingId]);
  for (const row of normalized) await conn.query(`
    INSERT INTO booking_items
      (booking_id,rental_item_id,item_name,quantity,daily_price,security_deposit,rental_days,line_rental_total,line_deposit_total,delivery_fee_per_piece,line_delivery_total)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `, [bookingId, row.item.id, row.item.name, row.quantity, row.dailyPrice, row.deposit, days, row.lineRental, row.lineDeposit, row.feePerPiece, row.lineDelivery]);
  await conn.query("INSERT INTO booking_status_history(booking_id,from_status,to_status,changed_by_user_id,note) VALUES(?,NULL,'pending',?,?)", [bookingId, changedByUserId, historyNote || "Booking created"]);

  return { bookingId, bookingNo, customer: contact, grandTotal };
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
  const [[customerEmailDelivery]] = await conn.query(`
    SELECT type,title,status,created_at FROM notifications
    WHERE booking_id=? AND channel='email'
    ORDER BY id DESC LIMIT 1
  `,[id]);
  const [[gcashPayment]] = await conn.query(`
    SELECT w.instructions_sent_at,w.proof_original_name,w.proof_uploaded_at,w.proof_status,
           w.reviewed_at,w.review_note,w.gcash_reference,w.verified_amount,
           u.full_name AS reviewed_by
    FROM booking_payment_workflows w
    LEFT JOIN users u ON u.id=w.reviewed_by_user_id
    WHERE w.booking_id=? LIMIT 1
  `,[id]);
  return {...booking,items,history,payments,inspection:inspection || null,gcash_payment:gcashPayment || null,customer_email_delivery:customerEmailDelivery || null};
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
