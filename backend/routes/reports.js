import { Router } from "express";
import { authenticate, requireRole } from "../lib/auth.js";
import { db } from "../lib/db.js";
import { getSetting } from "../lib/settings.js";
import { INCOME_AMOUNT_SQL } from "../lib/finance.js";

const router = Router();

router.get("/api/admin/dashboard", authenticate, requireRole("admin","manager","staff"), async (_req,res) => {
  const [[stats]] = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM bookings WHERE DATE(created_at)=CURDATE()) AS today_bookings,
      (SELECT COUNT(*) FROM bookings WHERE status IN ('rented','overdue')) AS active_rentals,
      (SELECT COUNT(*) FROM bookings WHERE status='overdue' OR (status='rented' AND end_date<CURDATE())) AS overdue_rentals,
      (SELECT COALESCE(SUM(${INCOME_AMOUNT_SQL}),0)
       FROM payments p JOIN bookings rb ON rb.id=p.booking_id WHERE p.status='completed' AND rb.status NOT IN ('cancelled','rejected') AND DATE(p.created_at)=CURDATE()) AS revenue_today,
      (SELECT COUNT(*) FROM bookings WHERE payment_status IN ('unpaid','partial') AND status NOT IN ('cancelled','rejected')) AS pending_payments,
      (SELECT COUNT(*) FROM rental_items WHERE status<>'active') AS unavailable_items,
      (SELECT COUNT(*) FROM bookings WHERE start_date>CURDATE() AND status IN ('confirmed','ready')) AS upcoming_reservations
  `);
  const [recent] = await db.query(`
    SELECT b.id,b.booking_no,b.customer_name,b.start_date,b.end_date,b.grand_total,b.status,
      GROUP_CONCAT(CONCAT(bi.item_name,' × ',bi.quantity) SEPARATOR ', ') items
    FROM bookings b LEFT JOIN booking_items bi ON bi.booking_id=b.id
    GROUP BY b.id ORDER BY b.created_at DESC LIMIT 6
  `);
  const [months] = await db.query(`
    SELECT DATE_FORMAT(p.created_at,'%Y-%m') month,
      COALESCE(SUM(${INCOME_AMOUNT_SQL}),0) revenue
    FROM payments p
    JOIN bookings b ON b.id=p.booking_id
    WHERE p.status='completed'
      AND b.status NOT IN ('cancelled','rejected')
      AND p.created_at>=DATE_SUB(CURDATE(),INTERVAL 11 MONTH)
    GROUP BY DATE_FORMAT(p.created_at,'%Y-%m') ORDER BY month
  `);
  const [daily] = await db.query(`
    WITH RECURSIVE dates AS (
      SELECT DATE_SUB(CURDATE(), INTERVAL 6 DAY) AS d
      UNION ALL
      SELECT DATE_ADD(d, INTERVAL 1 DAY) FROM dates WHERE d < CURDATE()
    )
    SELECT
      DATE_FORMAT(d.d,'%Y-%m-%d') AS date,
      DATE_FORMAT(d.d,'%a') AS label,
      COALESCE((
        SELECT SUM(${INCOME_AMOUNT_SQL})
        FROM payments p
        JOIN bookings pb ON pb.id=p.booking_id
        WHERE p.status='completed'
          AND pb.status NOT IN ('cancelled','rejected')
          AND DATE(p.created_at)=d.d
      ),0) AS revenue,
      COALESCE((
        SELECT COUNT(*) FROM bookings bb
        WHERE DATE(bb.created_at)=d.d
          AND bb.status NOT IN ('cancelled','rejected')
      ),0) AS bookings
    FROM dates d
    ORDER BY d.d
  `);
  res.json({stats,recent,months,daily});
});

router.get("/api/admin/booking-counts", authenticate, requireRole("admin","manager","staff"), async (_req,res,next) => {
  try {
    const [rows] = await db.query("SELECT status, COUNT(*) AS total FROM bookings GROUP BY status");
    const [[late]] = await db.query("SELECT COUNT(*) AS total FROM bookings WHERE status='overdue' OR (status='rented' AND end_date<CURDATE())");
    res.json({counts:Object.fromEntries(rows.map(r=>[r.status,Number(r.total)])),overdue:Number(late.total)});
  } catch(err) { next(err); }
});

router.get("/api/admin/escalations", authenticate, requireRole("admin","manager","staff"), async (_req,res) => {
  const [overdue]=await db.query(`
    SELECT b.id,b.booking_no,b.status,b.start_date,b.end_date,b.grand_total,
      b.customer_id,b.deposit_total,
      c.full_name AS customer_name,c.phone AS customer_phone,c.email AS customer_email,
      DATEDIFF(CURDATE(),b.end_date) AS overdue_days,
      GREATEST(0,DATEDIFF(CURDATE(),b.end_date)) AS days_overdue
    FROM bookings b
    JOIN customers c ON c.id=b.customer_id
    WHERE b.status IN ('overdue','rented') AND b.end_date < CURDATE()
    ORDER BY overdue_days DESC
  `);
  const lateRate=Number(await getSetting("late_fee_per_day","250"));
  const escalated=overdue.map(b=>{
    const days=b.days_overdue||0;
    let level="gentle";
    if(days>=14)level="final";
    else if(days>=7)level="formal";
    else if(days>=3)level="reminder";
    const lateFee=days*lateRate;
    return{...b,level,lateFee,daysText:`${days} day${days===1?"":"s"} overdue`};
  });
  const stats={total:escalated.length,gentle:escalated.filter(e=>e.level==="gentle").length,reminder:escalated.filter(e=>e.level==="reminder").length,formal:escalated.filter(e=>e.level==="formal").length,final:escalated.filter(e=>e.level==="final").length};
  res.json({escalated,stats});
});

router.get("/api/admin/reports", authenticate, requireRole("admin","manager"), async (_req,res,next) => {
  try {
    const validStatuses = ["confirmed","ready","rented","overdue","returned","completed"];
    const placeholders = validStatuses.map(()=>"?").join(",");

    const [[currencyRow]] = await db.query(
      "SELECT setting_value FROM business_settings WHERE setting_key='currency' LIMIT 1"
    );
    const currency = currencyRow?.setting_value || "PHP";

    const [[summary]] = await db.query(`
      SELECT
        (SELECT COALESCE(SUM(${INCOME_AMOUNT_SQL}),0)
           FROM payments p JOIN bookings b ON b.id=p.booking_id
          WHERE p.status='completed' AND b.status NOT IN ('cancelled','rejected')
            AND YEAR(p.created_at)=YEAR(CURDATE()) AND MONTH(p.created_at)=MONTH(CURDATE())) AS monthly_revenue,
        (SELECT COALESCE(SUM(${INCOME_AMOUNT_SQL}),0)
           FROM payments p JOIN bookings b ON b.id=p.booking_id
          WHERE p.status='completed' AND b.status NOT IN ('cancelled','rejected')
            AND YEAR(p.created_at)=YEAR(DATE_SUB(CURDATE(),INTERVAL 1 MONTH))
            AND MONTH(p.created_at)=MONTH(DATE_SUB(CURDATE(),INTERVAL 1 MONTH))) AS previous_month_revenue,
        (SELECT COUNT(*) FROM bookings b
          WHERE b.status IN (${placeholders})
            AND YEAR(b.created_at)=YEAR(CURDATE()) AND MONTH(b.created_at)=MONTH(CURDATE())) AS monthly_rentals,
        (SELECT COUNT(*) FROM bookings b
          WHERE b.status IN (${placeholders})
            AND YEAR(b.created_at)=YEAR(DATE_SUB(CURDATE(),INTERVAL 1 MONTH))
            AND MONTH(b.created_at)=MONTH(DATE_SUB(CURDATE(),INTERVAL 1 MONTH))) AS previous_month_rentals,
        (SELECT COALESCE(SUM(total_quantity),0) FROM rental_items WHERE status='active') AS total_rentable_units,
        (SELECT COALESCE(SUM(bi.quantity),0)
           FROM booking_items bi JOIN bookings b ON b.id=bi.booking_id
          WHERE b.status IN ('rented','overdue')
            AND CURDATE() BETWEEN b.start_date AND b.end_date) AS currently_rented_units
    `, [...validStatuses, ...validStatuses]);

    const [topItems] = await db.query(`
      SELECT
        bi.rental_item_id,
        COALESCE(r.name,bi.item_name) AS item_name,
        COALESCE(r.category,'Rental') AS category,
        r.image_url,
        SUM(bi.quantity) AS rented_quantity,
        COUNT(DISTINCT bi.booking_id) AS rental_count
      FROM booking_items bi
      JOIN bookings b ON b.id=bi.booking_id
      LEFT JOIN rental_items r ON r.id=bi.rental_item_id
      WHERE b.status IN (${placeholders})
        AND b.created_at >= DATE_FORMAT(DATE_SUB(CURDATE(),INTERVAL 11 MONTH),'%Y-%m-01')
      GROUP BY bi.rental_item_id,COALESCE(r.name,bi.item_name),COALESCE(r.category,'Rental'),r.image_url
      ORDER BY rented_quantity DESC,item_name ASC
      LIMIT 5
    `, validStatuses);

    const [monthlyRows] = await db.query(`
      SELECT DATE_FORMAT(p.created_at,'%Y-%m') AS month,
             COALESCE(SUM(${INCOME_AMOUNT_SQL}),0) AS revenue
      FROM payments p
      JOIN bookings b ON b.id=p.booking_id
      WHERE p.status='completed'
        AND b.status NOT IN ('cancelled','rejected')
        AND p.created_at >= DATE_FORMAT(DATE_SUB(CURDATE(),INTERVAL 11 MONTH),'%Y-%m-01')
      GROUP BY DATE_FORMAT(p.created_at,'%Y-%m')
      ORDER BY month
    `);

    // Always return exactly 12 calendar months, including zero-revenue months.
    const byMonth = new Map(monthlyRows.map(row => [row.month, Number(row.revenue || 0)]));
    const now = new Date();
    const revenueTrend = [];
    for (let offset = 11; offset >= 0; offset--) {
      const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const month = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      revenueTrend.push({
        month,
        label: d.toLocaleString("en-US", {month:"short"}),
        full_label: d.toLocaleString("en-US", {month:"long", year:"numeric"}),
        revenue: byMonth.get(month) || 0
      });
    }

    const monthlyRevenue = Number(summary.monthly_revenue || 0);
    const previousRevenue = Number(summary.previous_month_revenue || 0);
    const monthlyRentals = Number(summary.monthly_rentals || 0);
    const previousRentals = Number(summary.previous_month_rentals || 0);
    const totalRentable = Number(summary.total_rentable_units || 0);
    const currentlyRented = Number(summary.currently_rented_units || 0);
    const utilization = totalRentable > 0 ? Math.min(100, (currentlyRented / totalRentable) * 100) : 0;
    const percentChange = (current, previous) => previous > 0 ? ((current - previous) / previous) * 100 : null;

    res.json({
      currency,
      generated_at: new Date().toISOString(),
      summary: {
        monthly_revenue: monthlyRevenue,
        monthly_revenue_change: percentChange(monthlyRevenue, previousRevenue),
        total_rentals: monthlyRentals,
        rental_change: percentChange(monthlyRentals, previousRentals),
        utilization: Number(utilization.toFixed(1)),
        currently_rented_units: currentlyRented,
        total_rentable_units: totalRentable,
        top_item: topItems[0] || null
      },
      revenue_trend: revenueTrend,
      top_items: topItems.map(row => ({...row, rented_quantity:Number(row.rented_quantity||0), rental_count:Number(row.rental_count||0)}))
    });
  } catch (error) {
    next(error);
  }
});

export default router;
