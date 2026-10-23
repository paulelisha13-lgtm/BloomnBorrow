// Demonstration data for a LOCAL database only.
//
// Fills every admin screen (Dashboard, Bookings in every stage, Payments,
// Customers, Inventory, Maintenance, Calendar, Expenses, Profit & Loss,
// Reports, Audit Log, notifications) with realistic fake records so the app
// can be shown off. Dates are relative to today, so "today", "overdue" and
// "this month" views always have something in them.
//
//   npm run seed          (once, creates the schema, admin and catalog)
//   npm run seed:demo     (adds / refreshes the demo data)
//   npm run seed:demo -- --clear   (removes the demo data only)
//
// Every demo record is recognisable and removable: customers and staff use
// @demo.bloom-borrow.local emails, demo catalog items use RF-DEMO-* SKUs, and
// expenses / calendar entries / audit rows are recorded by the demo staff.
// Running it again first removes the previous demo data, so it never piles up.
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import "dotenv/config";
import { priceRentalLine, durationRuleOf } from "../lib/pricing.js";

const DB_HOST = process.env.DB_HOST || "127.0.0.1";
if (process.env.NODE_ENV === "production" || !["127.0.0.1", "localhost", "::1"].includes(DB_HOST)) {
  console.error("[seed:demo] REFUSED: demo data is only allowed on a local database (DB_HOST=127.0.0.1/localhost).");
  console.error("It would mix fake customers, bookings and money with real records.");
  process.exit(1);
}

const DEMO_DOMAIN = "demo.bloom-borrow.local";
const clearOnly = process.argv.includes("--clear");

const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const day = offset => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + offset); return d; };
const date = offset => ymd(day(offset));
const at = (offset, time = "10:00:00") => `${date(offset)} ${time}`;
const daysBetween = (a, b) => Math.round((day(b) - day(a)) / 86400000) + 1;

const db = await mysql.createConnection({
  host: DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "bloom_borrow"
});

async function clearDemo() {
  const [users] = await db.query("SELECT id FROM users WHERE email LIKE ?", [`%@${DEMO_DOMAIN}`]);
  const [bookings] = await db.query("SELECT id FROM bookings WHERE customer_email LIKE ?", [`%@${DEMO_DOMAIN}`]);
  const [items] = await db.query("SELECT id FROM rental_items WHERE sku LIKE 'RF-DEMO-%'");
  const userIds = users.map(r => r.id), bookingIds = bookings.map(r => r.id), itemIds = items.map(r => r.id);
  const inList = ids => (ids.length ? ids : [0]);

  await db.query("DELETE FROM expenses WHERE recorded_by_user_id IN (?) OR booking_id IN (?) OR rental_item_id IN (?)", [inList(userIds), inList(bookingIds), inList(itemIds)]);
  await db.query("DELETE FROM expense_suggestion_dismissals WHERE dismissed_by_user_id IN (?)", [inList(userIds)]);
  await db.query("DELETE FROM incidents WHERE booking_id IN (?) OR rental_item_id IN (?)", [inList(bookingIds), inList(itemIds)]);
  await db.query("DELETE FROM maintenance_records WHERE booking_id IN (?) OR rental_item_id IN (?)", [inList(bookingIds), inList(itemIds)]);
  await db.query("DELETE FROM item_conditions WHERE booking_id IN (?) OR rental_item_id IN (?) OR recorded_by_user_id IN (?)", [inList(bookingIds), inList(itemIds), inList(userIds)]);
  await db.query("DELETE FROM calendar_entries WHERE created_by_user_id IN (?) OR customer_email LIKE ?", [inList(userIds), `%@${DEMO_DOMAIN}`]);
  await db.query("DELETE FROM access_audit_logs WHERE user_id IN (?) OR target_user_id IN (?)", [inList(userIds), inList(userIds)]);
  // Cascades to booking items, status history, payments, GCash workflow,
  // return inspections and booking notifications.
  await db.query("DELETE FROM bookings WHERE id IN (?)", [inList(bookingIds)]);
  await db.query("DELETE FROM customers WHERE email LIKE ?", [`%@${DEMO_DOMAIN}`]);
  await db.query("DELETE FROM rental_items WHERE id IN (?)", [inList(itemIds)]);
  await db.query("DELETE FROM users WHERE id IN (?)", [inList(userIds)]);
  return { bookings: bookingIds.length, users: userIds.length, items: itemIds.length };
}

try {
  const removed = await clearDemo();
  console.log(`[seed:demo] Removed previous demo data (${removed.bookings} bookings, ${removed.users} staff, ${removed.items} items).`);
  if (clearOnly) process.exit(0);

  const [[admin]] = await db.query("SELECT id FROM users WHERE role='admin' AND email NOT LIKE ? ORDER BY id LIMIT 1", [`%@${DEMO_DOMAIN}`]);
  const [[{ itemCount }]] = await db.query("SELECT COUNT(*) itemCount FROM rental_items WHERE sku LIKE 'RF-%' AND sku NOT LIKE 'RF-DEMO-%'");
  if (!admin || Number(itemCount) === 0) {
    console.error("[seed:demo] Run `npm run seed` first: it creates the admin account and the rental catalog.");
    process.exit(1);
  }

  // ---- Staff accounts (Access Management) --------------------------------
  // Random passwords: these accounts exist to be listed, not signed into.
  const staffHash = await bcrypt.hash(crypto.randomBytes(24).toString("base64url"), 10);
  const staff = {};
  for (const [key, full_name, role, status, phone, lastLogin] of [
    ["manager", "Andrea Villanueva", "manager", "active", "+63 917 555 0101", at(0, "08:12:00")],
    ["staff", "Paolo Mendoza", "staff", "active", "+63 918 555 0102", at(-1, "17:40:00")],
    ["former", "Kristine Ramos", "staff", "disabled", "+63 919 555 0103", at(-60, "09:05:00")]
  ]) {
    const [r] = await db.query(
      `INSERT INTO users(full_name,email,phone,password_hash,role,status,password_changed_at,last_login_at,created_at)
       VALUES(?,?,?,?,?,?,?,?,?)`,
      [full_name, `${key}@${DEMO_DOMAIN}`, phone, staffHash, role, status, at(-90), lastLogin, at(-120)]
    );
    staff[key] = r.insertId;
  }

  // ---- Extra catalog items: every field filled, every status shown ---------
  const [catalog] = await db.query("SELECT image_url FROM rental_items WHERE image_url IS NOT NULL ORDER BY id");
  const images = catalog.map(r => r.image_url);
  const img = i => images[i % images.length];
  // Gallery slots 2 and 3 for the base catalog, only where still empty.
  const [baseItems] = await db.query("SELECT id FROM rental_items WHERE sku NOT LIKE 'RF-DEMO-%' ORDER BY id");
  for (const [i, row] of baseItems.entries()) {
    await db.query("UPDATE rental_items SET image_url_2=COALESCE(image_url_2,?), image_url_3=COALESCE(image_url_3,?) WHERE id=?", [img(i + 1), img(i + 2), row.id]);
  }
  const demoItems = [
    ["RF-DEMO-001", "Wedding Backdrop & Arch Set", "Events", "Floral arch, white drape backdrop and LED fairy lights for weddings, debuts and photo walls.", 2500, 3000, 1, "percent", 10, 5000, 2, "active",
      [{ name: "Metal Arch Frame", quantity: 1 }, { name: "White Drape Panel", quantity: 3 }, { name: "Faux Flower Garland", quantity: 4 }, { name: "LED Fairy Lights", quantity: 2 }]],
    ["RF-DEMO-002", "DJI Mini 4 Pro Drone", "Camera", "Lightweight 4K drone with three batteries for aerial event and travel footage.", 1800, null, 1, "fixed", 200, 8000, 2, "maintenance", null],
    ["RF-DEMO-003", "Karaoke Machine (Magic Sing)", "Audio", "Home karaoke system with two wireless microphones and a song chip. Currently retired from the catalog.", 700, null, 0, "percent", 0, 1500, 3, "inactive", null]
  ];
  const itemIds = {};
  for (const [i, [sku, name, category, description, price, original, discOn, discType, discValue, deposit, qty, status, bundle]] of demoItems.entries()) {
    const [r] = await db.query(
      `INSERT INTO rental_items(sku,name,category,description,daily_price,original_price,duration_discount_enabled,duration_discount_type,
         duration_discount_value,security_deposit,total_quantity,status,image_url,image_url_2,image_url_3,bundle_items,created_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [sku, name, category, description, price, original, discOn, discType, discValue, deposit, qty, status, img(i), img(i + 3), img(i + 4), bundle ? JSON.stringify(bundle) : null, at(-100)]
    );
    itemIds[sku] = r.insertId;
  }

  const [itemRows] = await db.query("SELECT * FROM rental_items");
  const item = sku => itemRows.find(r => r.sku === sku);

  // ---- Customers -------------------------------------------------------------
  const people = [
    ["Maria Santos", "maria.santos", "+63 917 321 4401", "Unit 5B, Palm Residences, Molino Blvd", "Bacoor", "Cavite", "4102", "active"],
    ["Jose Reyes", "jose.reyes", "+63 918 222 8810", "Blk 12 Lot 4, Biclatan Homes", "General Trias", "Cavite", "4107", "active"],
    ["Angelica Cruz", "angelica.cruz", "+63 919 640 1123", "88 Aguinaldo Hwy, Brgy. Salitran", "Dasmariñas", "Cavite", "4114", "active"],
    ["Mark Bautista", "mark.bautista", "+63 927 410 7765", "21 Narra St, Brgy. Pasong Tamo", "Quezon City", "Metro Manila", "1107", "active"],
    ["Patricia Garcia", "patricia.garcia", "+63 905 118 2290", "Tower 2, 1408 Avida Turf", "Taguig", "Metro Manila", "1634", "active"],
    ["Carlo Dela Cruz", "carlo.delacruz", "+63 916 773 5502", "Phase 3, Lancaster New City", "Imus", "Cavite", "4103", "active"],
    ["Bea Navarro", "bea.navarro", "+63 921 556 9034", "14 Mabini St, Poblacion", "Tanza", "Cavite", "4108", "active"],
    ["Ramon Aquino", "ramon.aquino", "+63 998 300 4417", "Lot 9, Sampaguita Village", "Silang", "Cavite", "4118", "blocked"]
  ];
  const customers = {};
  for (const [i, [full_name, handle, phone, address, city, province, postal, status]] of people.entries()) {
    const email = `${handle}@${DEMO_DOMAIN}`;
    const [r] = await db.query(
      "INSERT INTO customers(full_name,email,phone,city,address,province,postal_code,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
      [full_name, email, phone, city, address, province, postal, status, at(-75 + i * 6)]
    );
    customers[handle] = { id: r.insertId, full_name, email, phone, address, city, province, postal };
  }

  // ---- Bookings: one or more in every status --------------------------------
  const [settingRows] = await db.query("SELECT setting_key,setting_value FROM business_settings");
  const settings = Object.fromEntries(settingRows.map(r => [r.setting_key, r.setting_value]));
  const termsSnapshot = JSON.stringify({
    title: "Rental Terms & Conditions",
    version: settings.rental_terms_version || "1.0",
    business_name: settings.business_name || "Bloom & Borrow",
    accepted_from: "demo data"
  });

  // [customer, items [[sku,qty]], startOffset, endOffset, fulfillment, method, status, createdOffset, extras]
  const plan = [
    ["maria.santos", [["RF-DEMO-001", 1], ["RF-EVT-002", 2]], 6, 8, "delivery", "gcash", "pending", -1, { notes: "Garden wedding, setup needed by 2 PM.", deliveryFee: 600, deliveryPending: true }],
    ["jose.reyes", [["RF-AUD-001", 2]], 4, 5, "pickup", "cash", "pending", 0, { notes: "Birthday party, will pick up in the morning." }],
    ["angelica.cruz", [["RF-CAM-001", 1]], 2, 4, "pickup", "gcash", "confirmed", -3, { pay: "partial", gcash: "awaiting" }],
    ["mark.bautista", [["RF-EVT-001", 1], ["RF-AUD-001", 1]], 0, 1, "delivery", "bank_transfer", "ready", -6, { pay: "paid", deliveryFee: 300, notes: "Company town hall, deliver to lobby." }],
    ["patricia.garcia", [["RF-OUT-001", 2]], -2, 2, "pickup", "gcash", "rented", -8, { pay: "paid", gcash: "approved" }],
    ["carlo.delacruz", [["RF-TOL-001", 1]], -3, 0, "delivery", "cash", "rented", -9, { pay: "paid", deliveryFee: 300 }],
    ["bea.navarro", [["RF-CAM-001", 1]], -6, -2, "pickup", "cash", "overdue", -12, { pay: "paid", notes: "Customer asked for an extension by text; not yet approved." }],
    ["maria.santos", [["RF-EVT-002", 3]], -4, -1, "delivery", "cash", "returned", -10, { pay: "paid", deliveryFee: 300, inspection: { condition: "Good" } }],
    ["jose.reyes", [["RF-AUD-001", 1], ["RF-EVT-002", 1]], -22, -20, "pickup", "gcash", "completed", -27, { pay: "paid", inspection: { condition: "Excellent" } }],
    ["angelica.cruz", [["RF-EVT-001", 1]], -38, -35, "delivery", "bank_transfer", "completed", -44, { pay: "paid", deliveryFee: 300,
      inspection: { condition: "Fair", damage: 1200, notes: "Projector lens scratched; screen frame bent." }, incident: "resolved_charged", maintenance: "completed" }],
    ["mark.bautista", [["RF-OUT-001", 3]], -55, -52, "pickup", "cash", "completed", -60, { pay: "paid", inspection: { condition: "Good", lateDays: 1 } }],
    ["patricia.garcia", [["RF-TOL-001", 1]], -48, -46, "pickup", "cash", "completed", -50, { pay: "paid",
      inspection: { condition: "Lost", damage: 2200, notes: "Battery pack and charger not returned." }, incident: "written_off" }],
    ["carlo.delacruz", [["RF-CAM-001", 1]], 10, 12, "pickup", "gcash", "cancelled", -5, { pay: "refunded", notes: "Event postponed by the customer." }],
    ["ramon.aquino", [["RF-DEMO-002", 1]], 3, 5, "delivery", "cash", "rejected", -4, { notes: "ID could not be verified.", deliveryFee: 500 }],
    ["bea.navarro", [["RF-DEMO-001", 1]], -70, -68, "delivery", "gcash", "completed", -78, { pay: "paid", deliveryFee: 500, inspection: { condition: "Good" } }]
  ];

  const statusTrail = {
    pending: ["pending"],
    confirmed: ["pending", "confirmed"],
    ready: ["pending", "confirmed", "ready"],
    rented: ["pending", "confirmed", "ready", "rented"],
    overdue: ["pending", "confirmed", "ready", "rented", "overdue"],
    returned: ["pending", "confirmed", "ready", "rented", "returned"],
    completed: ["pending", "confirmed", "ready", "rented", "returned", "completed"],
    cancelled: ["pending", "confirmed", "cancelled"],
    rejected: ["pending", "rejected"]
  };
  const trailNote = { confirmed: "Rental request approved", ready: "Items prepared and checked", rented: "Released to customer",
    overdue: "Past the return date", returned: "Return inspection recorded", completed: "Rental completed",
    cancelled: "Cancelled at the customer's request", rejected: "Rental request rejected" };
  const actors = [admin.id, staff.manager, staff.staff];

  let refCounter = 1000;
  const created = [];
  for (const [n, [handle, lines, startOff, endOff, fulfillment, method, status, createdOff, x]] of plan.entries()) {
    const c = customers[handle];
    const days = daysBetween(startOff, endOff);
    const priced = lines.map(([sku, qty]) => {
      const it = item(sku);
      return { it, qty, ...priceRentalLine({ dailyPrice: it.daily_price, rule: durationRuleOf(it), days, quantity: qty }) };
    });
    const rentalSubtotal = priced.reduce((s, l) => s + l.rental, 0);
    const depositTotal = priced.reduce((s, l) => s + Number(l.it.security_deposit) * l.qty, 0);
    const deliveryFee = fulfillment === "delivery" ? (x.deliveryFee || 0) : 0;
    const grandTotal = rentalSubtotal + depositTotal + deliveryFee;
    const createdAt = at(createdOff, `${pad(9 + (n % 8))}:${pad((n * 7) % 60)}:00`);

    const [r] = await db.query(
      `INSERT INTO bookings(customer_id,customer_name,customer_email,customer_phone,city,delivery_address,province,postal_code,start_date,end_date,
         fulfillment,payment_method,payment_status,status,rental_subtotal,deposit_total,delivery_fee,delivery_fee_confirmed_at,grand_total,notes,
         rental_terms_version,rental_terms_accepted_at,rental_terms_snapshot,created_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'unpaid',?,?,?,?,?,?,?,?,?,?,?)`,
      [c.id, c.full_name, c.email, c.phone, c.city, fulfillment === "delivery" ? c.address : null, c.province, c.postal,
        date(startOff), date(endOff), fulfillment, method, status, rentalSubtotal, depositTotal, deliveryFee,
        x.deliveryPending ? null : createdAt, grandTotal, x.notes || null,
        settings.rental_terms_version || "1.0", createdAt, termsSnapshot, createdAt]
    );
    const bookingId = r.insertId;
    const bookingNo = `RF-${String(bookingId).padStart(6, "0")}`;
    await db.query("UPDATE bookings SET booking_no=? WHERE id=?", [bookingNo, bookingId]);

    for (const l of priced) {
      const rule = durationRuleOf(l.it);
      await db.query(
        `INSERT INTO booking_items(booking_id,rental_item_id,item_name,quantity,daily_price,security_deposit,rental_days,line_rental_total,
           duration_discount_type,duration_discount_value,duration_discount_per_day,line_deposit_total,delivery_fee_per_piece,line_delivery_total,created_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [bookingId, l.it.id, l.it.name, l.qty, l.it.daily_price, l.it.security_deposit, days, l.rental,
          l.qualifies ? rule.type : null, l.qualifies ? rule.value : null, l.discountPerDay,
          Number(l.it.security_deposit) * l.qty, 0, 0, createdAt]
      );
    }

    // Status history, one step per stage, spread between booking and today.
    const trail = statusTrail[status];
    let prev = null;
    for (const [i, s] of trail.entries()) {
      const stepOff = Math.min(0, createdOff + Math.round(((Math.min(endOff, 0) - createdOff) * i) / Math.max(1, trail.length - 1)));
      await db.query(
        "INSERT INTO booking_status_history(booking_id,from_status,to_status,changed_by_user_id,note,created_at) VALUES(?,?,?,?,?,?)",
        [bookingId, prev, s, i === 0 ? null : actors[(n + i) % actors.length], i === 0 ? "Rental request submitted" : trailNote[s] || null,
          i === 0 ? createdAt : at(stepOff, `${pad(10 + i)}:15:00`)]
      );
      prev = s;
    }

    // Payments.
    const pay = async (amount, type, offset, extra = {}) => {
      const ref = method === "cash" ? null : `${method === "gcash" ? "GC" : "BT"}-${date(offset).replace(/-/g, "")}-${refCounter++}`;
      await db.query(
        "INSERT INTO payments(booking_id,amount,payment_type,method,reference_no,status,notes,recorded_by_user_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
        [bookingId, amount, type, extra.method || method, ref, extra.status || "completed", extra.notes || null, actors[n % actors.length], at(offset, "14:30:00")]
      );
    };
    const paidOff = Math.min(0, startOff - 1);
    if (x.pay === "partial") {
      await pay(Math.round(rentalSubtotal / 2), "rental", createdOff + 1, { notes: "50% reservation payment" });
    } else if (x.pay === "paid" || x.pay === "refunded") {
      await pay(rentalSubtotal, "rental", paidOff);
      if (deliveryFee) await pay(deliveryFee, "delivery", paidOff);
      await pay(depositTotal, "deposit", paidOff, { notes: "Security deposit held" });
      if (n === 4) await pay(500, "other", createdOff + 1, { status: "void", notes: "Duplicate entry, voided" });
    }
    if (x.pay === "refunded") {
      await pay(rentalSubtotal + depositTotal, "refund", -1, { notes: "Full refund after cancellation" });
    }

    // GCash payment workflow.
    if (x.gcash === "awaiting") {
      await db.query("INSERT INTO booking_payment_workflows(booking_id,instructions_sent_at,instructions_sent_by_user_id,proof_status) VALUES(?,?,?,'awaiting')",
        [bookingId, at(createdOff + 1, "11:00:00"), staff.manager]);
    } else if (x.gcash === "approved") {
      await db.query(
        `INSERT INTO booking_payment_workflows(booking_id,instructions_sent_at,instructions_sent_by_user_id,proof_status,reviewed_at,reviewed_by_user_id,review_note,gcash_reference,verified_amount)
         VALUES(?,?,?,'approved',?,?,?,?,?)`,
        [bookingId, at(createdOff + 1, "11:00:00"), staff.manager, at(paidOff, "15:00:00"), admin.id, "Amount and reference match the GCash receipt.", `GC-${refCounter++}`, grandTotal]);
    }

    // Return inspection, deposit refund, damage follow-ups.
    if (x.inspection) {
      const ins = x.inspection;
      const lateDays = ins.lateDays || 0;
      const lateFee = lateDays * Number(settings.late_fee_per_day || 250);
      const damage = ins.damage || 0;
      const refund = Math.max(0, depositTotal - lateFee - damage);
      await db.query(
        `INSERT INTO return_inspections(booking_id,returned_at,condition_before,condition_after,missing_items,damage_notes,late_days,late_fee,damage_charge,deposit_refund,maintenance_required,inspected_by_user_id)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        [bookingId, at(endOff + lateDays, "16:00:00"), "Good", ins.condition, ins.condition === "Lost" ? "Battery Pack + Charger" : null,
          ins.notes || null, lateDays, lateFee, damage, refund, x.maintenance ? 1 : 0, staff.staff]
      );
      for (const l of priced) {
        await db.query("INSERT INTO item_conditions(rental_item_id,booking_id,condition_status,condition_type,notes,recorded_by_user_id,created_at) VALUES(?,?,'excellent','before_rental',?,?,?)",
          [l.it.id, bookingId, "Checked and cleaned before release", staff.staff, at(startOff, "08:30:00")]);
        await db.query("INSERT INTO item_conditions(rental_item_id,booking_id,condition_status,condition_type,notes,recorded_by_user_id,created_at) VALUES(?,?,?,'after_return',?,?,?)",
          [l.it.id, bookingId, ins.condition.toLowerCase(), ins.notes || "Returned complete", staff.staff, at(endOff + lateDays, "16:10:00")]);
      }
      if (status === "completed" && refund > 0) {
        await pay(refund, "refund", endOff + lateDays + 1, { method: "cash", notes: "Deposit refund recorded at completion" });
      }
      if (x.incident) {
        const [[{ cnt }]] = await db.query("SELECT COUNT(*) cnt FROM incidents");
        const lost = ins.condition === "Lost";
        await db.query(
          `INSERT INTO incidents(incident_no,rental_item_id,booking_id,customer_id,incident_type,status,description,replacement_cost,charge_amount,insurance_claim_amount,
             resolution_notes,reported_by_user_id,resolved_by_user_id,reported_at,resolved_at,created_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [`INC-${String(Number(cnt) + 1).padStart(6, "0")}`, priced[0].it.id, bookingId, c.id, lost ? "partially_missing" : "damaged_minor", x.incident,
            ins.notes, lost ? 3500 : 1200, damage, 0,
            lost ? "Charged against the deposit; remaining cost written off." : "Repair cost deducted from the security deposit.",
            staff.staff, admin.id, at(endOff, "16:20:00"), at(endOff + 3, "10:00:00"), at(endOff, "16:20:00")]
        );
      }
      if (x.maintenance) {
        const [m] = await db.query(
          "INSERT INTO maintenance_records(rental_item_id,booking_id,reason,status,cost,opened_at,completed_at,notes) VALUES(?,?,?,?,?,?,?,?)",
          [priced[0].it.id, bookingId, "Return inspection flagged maintenance", "completed", 1500, at(endOff, "16:30:00"), at(endOff + 4, "13:00:00"), "Lens replaced at service center; frame straightened."]
        );
        await db.query(
          `INSERT INTO expenses(expense_date,category,amount,description,booking_id,rental_item_id,source_type,source_id,recorded_by_user_id,created_at)
           VALUES(?,?,?,?,?,?,'maintenance',?,?,?)`,
          [date(endOff + 4), "Repairs & Maintenance", 1500, `Projector lens repair (${bookingNo})`, bookingId, priced[0].it.id, m.insertId, staff.manager, at(endOff + 4, "13:30:00")]
        );
      }
    }

    // Payment status the same way the app derives it.
    const [[sums]] = await db.query(
      `SELECT COALESCE(SUM(CASE WHEN payment_type<>'refund' THEN amount END),0) paid,
              COALESCE(SUM(CASE WHEN payment_type='refund' THEN amount END),0) refunded
         FROM payments WHERE booking_id=? AND status='completed'`, [bookingId]);
    const paid = Number(sums.paid), refunded = Number(sums.refunded);
    let payStatus = "unpaid";
    if (paid > 0 && paid < grandTotal) payStatus = "partial";
    if (paid > 0 && paid >= grandTotal) payStatus = "paid";
    if (paid > 0 && refunded >= paid) payStatus = "refunded";
    await db.query("UPDATE bookings SET payment_status=? WHERE id=?", [payStatus, bookingId]);

    created.push({ bookingId, bookingNo, status, c, startOff, endOff });
  }

  // ---- Maintenance not tied to a booking ------------------------------------
  await db.query("INSERT INTO maintenance_records(rental_item_id,reason,status,cost,opened_at,notes) VALUES(?,?,?,?,?,?)",
    [itemIds["RF-DEMO-002"], "Gimbal calibration error after firmware update", "in_progress", 0, at(-3, "09:00:00"), "Sent to DJI service partner in Makati; awaiting quote."]);
  await db.query("INSERT INTO maintenance_records(rental_item_id,reason,status,cost,opened_at,notes) VALUES(?,?,?,?,?,?)",
    [item("RF-OUT-001").id, "Torn rain fly on one tent", "open", 0, at(-1, "15:00:00"), "Patch kit ordered."]);
  await db.query("INSERT INTO incidents(incident_no,rental_item_id,customer_id,incident_type,status,description,replacement_cost,charge_amount,reported_by_user_id,reported_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    [`INC-D${String(Date.now()).slice(-5)}`, itemIds["RF-DEMO-002"], null, "other", "investigating", "Drone gimbal error found during routine pre-rental check.", 0, 0, staff.staff, at(-3, "09:05:00"), at(-3, "09:05:00")]);

  // ---- Expenses over the last three months ----------------------------------
  const expenseRows = [
    [-2, "Delivery / Transport", 450, "Fuel for Bacoor and Imus deliveries"],
    [-5, "Cleaning / Laundry", 680, "Table cloth and drape laundry"],
    [-9, "Supplies", 1250, "Bubble wrap, packing tape and storage bins"],
    [-12, "Marketing", 2000, "Facebook page boost"],
    [-15, "Rent & Utilities", 6500, "Storage unit rent"],
    [-16, "Staff", 4000, "Weekend event helper (2 days)"],
    [-28, "Item Purchase", 9800, "Two extra folding table sets"],
    [-33, "Delivery / Transport", 900, "Lalamove for Taguig delivery"],
    [-45, "Rent & Utilities", 6500, "Storage unit rent"],
    [-47, "Cleaning / Laundry", 520, "Tent cleaning and drying"],
    [-50, "Damage & Loss", 1300, "Replacement charger for power tool kit"],
    [-62, "Marketing", 1500, "Printed flyers for subdivision events"],
    [-75, "Rent & Utilities", 6500, "Storage unit rent"],
    [-80, "Other", 350, "Business permit photocopies and notarization"]
  ];
  for (const [i, [off, category, amount, description]] of expenseRows.entries()) {
    await db.query(
      "INSERT INTO expenses(expense_date,category,amount,description,source_type,recorded_by_user_id,created_at) VALUES(?,?,?,?, 'manual',?,?)",
      [date(off), category, amount, description, i % 2 ? staff.staff : staff.manager, at(off, "18:00:00")]
    );
  }

  // ---- Calendar ---------------------------------------------------------------
  const cal = [
    ["reservation", "Debut setup inquiry", "Lianne Torres", "lianne.torres", "+63 917 888 1200", 9, "14:00:00", "15:00:00", 120, "Tagaytay Events Place", "pending", "Debut", 8, "Wants backdrop + speakers + 15 tables."],
    ["reservation", "Corporate team building", "Mark Bautista", "mark.bautista", "+63 927 410 7765", 14, "08:00:00", "17:00:00", 60, "Caliraya Resort", "confirmed", "Corporate", 12, "Tents and projector set."],
    ["event", "Biclatan town fiesta booth", null, null, null, 18, "09:00:00", "18:00:00", null, "Biclatan Covered Court", "confirmed", "Marketing", 17, "Display the arch and camera kits."],
    ["note", "Inventory count", null, null, null, 1, "17:00:00", "18:30:00", null, "Storage unit", "pending", "Operations", null, "Count tables, chairs and tents before the weekend."],
    ["event", "Supplier visit: tent restock", null, null, null, -6, "10:00:00", "11:00:00", null, "Storage unit", "completed", "Operations", null, "Received 2 replacement rain flies."],
    ["reservation", "Kiddie party package", "Bea Navarro", "bea.navarro", "+63 921 556 9034", 21, "13:00:00", "17:00:00", 35, "Tanza clubhouse", "cancelled", "Birthday", null, "Customer moved the party to next year."]
  ];
  for (const [i, [type, title, name, handle, phone, off, start, end, guests, location, status, category, remindOff, details]] of cal.entries()) {
    await db.query(
      `INSERT INTO calendar_entries(entry_type,title,customer_name,customer_email,customer_phone,entry_date,start_time,end_time,guests,location,status,category,
         reminder_at,details,notes,created_by_user_id,created_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [type, title, name, handle ? `${handle}@${DEMO_DOMAIN}` : null, phone, date(off), start, end, guests, location, status, category,
        remindOff == null ? null : at(remindOff, "09:00:00"), details, "Demo entry", i % 2 ? staff.staff : staff.manager, at(Math.min(0, off) - 3)]
    );
  }

  // ---- Notifications (bell) ----------------------------------------------------
  const byStatus = s => created.find(b => b.status === s);
  const notes = [
    [byStatus("pending"), "new_booking", "New rental request", n => `${n.c.full_name} requested ${n.bookingNo}.`, "sent", null],
    [byStatus("overdue"), "booking_overdue", "Booking overdue", n => `${n.bookingNo} for ${n.c.full_name} is past its return date.`, "sent", null],
    [byStatus("returned"), "booking_returned", "Return recorded", n => `${n.bookingNo} was returned and is ready to complete.`, "read", at(0, "08:00:00")],
    [byStatus("confirmed"), "payment_received", "Partial payment received", n => `Reservation payment recorded for ${n.bookingNo}.`, "read", at(-1, "12:00:00")]
  ];
  for (const [b, type, title, msg, status, readAt] of notes) {
    await db.query("INSERT INTO notifications(user_id,booking_id,channel,type,title,message,status,read_at,created_at) VALUES(NULL,?,'in_app',?,?,?,?,?,?)",
      [b.bookingId, type, title, msg(b), status, readAt, at(-1, "09:30:00")]);
  }

  // ---- Audit log -----------------------------------------------------------------
  const ip = "192.168.1.24", ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36";
  const auditRows = [
    [staff.manager, "LOGIN_SUCCESS", null, {}, 0],
    [staff.staff, "LOGIN_SUCCESS", null, {}, -1],
    [staff.staff, "RECORD_PAYMENT", null, { booking_id: byStatus("ready").bookingId, type: "rental" }, -1],
    [staff.manager, "BOOKING_STATUS", null, { booking_id: byStatus("confirmed").bookingId, from: "pending", to: "confirmed" }, -2],
    [staff.staff, "RETURN_INSPECTION", null, { booking_id: byStatus("returned").bookingId, condition_after: "Good" }, -1],
    [staff.former, "LOGIN_FAILED", staff.former, { email: `former@${DEMO_DOMAIN}`, attempts: 1 }, -60],
    [staff.manager, "UPDATE_OWN_PROFILE", staff.manager, { changes: { phone: { from: "+63 917 555 0000", to: "+63 917 555 0101" } } }, -30]
  ];
  for (const [userId, action, target, details, off] of auditRows) {
    await db.query("INSERT INTO access_audit_logs(user_id,action,target_user_id,ip_address,user_agent,details,created_at) VALUES(?,?,?,?,?,?,?)",
      [userId, action, target, ip, ua, JSON.stringify(details), at(off, "09:45:00")]);
  }

  console.log("");
  console.log("[seed:demo] Demo data ready:");
  console.table(created.map(b => ({ booking: b.bookingNo, status: b.status, customer: b.c.full_name, start: date(b.startOff), end: date(b.endOff) })));
  console.log("Remove it any time with: npm run seed:demo -- --clear");
} catch (error) {
  console.error("[seed:demo] FAILED:", error?.message || error);
  process.exitCode = 1;
} finally {
  await db.end().catch(() => {});
}
