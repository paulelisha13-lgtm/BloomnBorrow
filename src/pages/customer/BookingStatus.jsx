import React, { useState } from "react";
import { CustomerShell } from "../../components/customer/CustomerShell";
import { publicApi } from "../../lib/publicApi";
import { peso } from "../../lib/format";

const STATUS_LABELS = { pending: "Waiting for approval", confirmed: "Confirmed", ready: "Ready", rented: "Rented", returned: "Returned", completed: "Completed", cancelled: "Cancelled", rejected: "Rejected", overdue: "Overdue" };

export function CustomerBookingStatus() {
  const [bookingNo, setBookingNo] = useState("");
  const [email, setEmail] = useState("");
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async e => {
    e.preventDefault();
    setError("");
    setBooking(null);
    setLoading(true);
    try {
      const data = await publicApi(`/public/bookings/lookup?booking_no=${encodeURIComponent(bookingNo.trim())}&email=${encodeURIComponent(email.trim())}`);
      setBooking(data.booking);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return <CustomerShell title="Check your rental status" subtitle="Enter your booking number and the email you used to request it.">
    <section className="admin-card shop-booking-form">
      <form onSubmit={submit}>
        {error && <div className="login-error">{error}</div>}
        <div className="form-grid">
          <label>Booking number<input value={bookingNo} onChange={e => setBookingNo(e.target.value)} placeholder="RF-000006" required /></label>
          <label>Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required /></label>
        </div>
        <button className="primary-button full" disabled={loading}>{loading ? "Checking…" : "Check status"}</button>
      </form>
    </section>

    {booking && <section className="admin-card shop-status-result">
      <div className="card-heading"><div><span>{booking.booking_no}</span><h2>Rental request status</h2></div><span className={`status-pill ${booking.status}`}>{STATUS_LABELS[booking.status] || booking.status}</span></div>
      <dl className="detail-grid">
        <div><small>Dates</small><strong>{booking.start_date} → {booking.end_date}</strong></div>
        <div><small>Items</small><strong>{booking.items.map(i => `${i.item_name} × ${i.quantity}`).join(", ")}</strong></div>
        <div><small>Total</small><strong>{peso(Number(booking.grand_total))}</strong></div>
        <div><small>Payment</small><strong>{booking.payment_status}</strong></div>
      </dl>
    </section>}
  </CustomerShell>;
}
