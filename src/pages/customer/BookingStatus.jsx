import React, { useState } from "react";
import { CustomerShell } from "../../components/customer/CustomerShell";
import { publicApi, publicApiForm } from "../../lib/publicApi";
import { peso } from "../../lib/format";

const STATUS_LABELS = { pending: "Waiting for approval", confirmed: "Confirmed", ready: "Ready", rented: "Rented", returned: "Returned", completed: "Completed", cancelled: "Cancelled", rejected: "Rejected", overdue: "Overdue" };
const PROOF_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PROOF_BYTES = 5 * 1024 * 1024;

export function CustomerBookingStatus() {
  const [bookingNo, setBookingNo] = useState("");
  const [email, setEmail] = useState("");
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [proofFile, setProofFile] = useState(null);
  const [proofError, setProofError] = useState("");
  const [uploadingProof, setUploadingProof] = useState(false);

  const submit = async e => {
    e.preventDefault();
    setError("");
    setBooking(null);
    setProofFile(null);
    setProofError("");
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

  const chooseProof = e => {
    const file = e.target.files?.[0];
    setProofError("");
    if (!file) return setProofFile(null);
    if (!PROOF_TYPES.includes(file.type)) {
      e.target.value = "";
      setProofFile(null);
      return setProofError("Payment proof must be a JPG, PNG, or WebP image.");
    }
    if (file.size > MAX_PROOF_BYTES) {
      e.target.value = "";
      setProofFile(null);
      return setProofError("Payment proof must be 5MB or smaller.");
    }
    setProofFile(file);
  };

  const uploadProof = async e => {
    e.preventDefault();
    if (!proofFile) return setProofError("Choose your payment screenshot first.");
    setUploadingProof(true);
    setProofError("");
    try {
      const body = new FormData();
      body.append("booking_no", bookingNo.trim());
      body.append("email", email.trim());
      body.append("payment_proof", proofFile);
      const data = await publicApiForm("/public/bookings/payment-proof", body);
      setBooking(current => ({...current,payment_proof_status:data.payment_proof_status,payment_proof_uploaded_at:data.payment_proof_uploaded_at}));
      setProofFile(null);
    } catch (e) {
      setProofError(e.message);
    } finally {
      setUploadingProof(false);
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
        <button className={`primary-button full ${loading ? "is-loading" : ""}`} disabled={loading} aria-busy={loading}>{loading ? "Checking…" : "Check status"}</button>
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
      {booking.payment_method === "gcash" && <div className="shop-status-payment">
        <h3>GCash Payment</h3>
        {!booking.gcash_instructions_sent ? <p>Your GCash QR code and payment instructions will be emailed after Admin reviews and approves your request.</p> :
          booking.payment_status === "paid" ? <div className="shop-proof-complete"><strong>Payment received</strong><span>Your GCash payment has been recorded.</span></div> :
          ["cancelled","rejected","completed"].includes(booking.status) ? <p>This request is closed, so payment proof uploads are no longer available.</p> :
          booking.payment_proof_status === "submitted" ? <div className="shop-proof-complete"><strong>Payment proof submitted</strong><span>Your screenshot is ready for Admin review.</span></div> :
          <form className="shop-proof-form" onSubmit={uploadProof}>
            <p>Payment instructions were sent to your registered email. After paying, upload your screenshot below.</p>
            <label>Payment screenshot
              <input type="file" accept={PROOF_TYPES.join(",")} onChange={chooseProof} required />
            </label>
            {proofError && <div className="login-error">{proofError}</div>}
            <button className={`primary-button ${uploadingProof ? "is-loading" : ""}`} disabled={uploadingProof || !proofFile} aria-busy={uploadingProof}>{uploadingProof ? "Uploading…" : "Upload Payment Proof"}</button>
            <small>JPG, PNG, or WebP · up to 5MB</small>
          </form>}
      </div>}
    </section>}
  </CustomerShell>;
}
