import React, { useEffect, useState } from "react";
import { CustomerShell } from "../../components/customer/CustomerShell";
import { publicApi, publicApiForm } from "../../lib/publicApi";
import { peso } from "../../lib/format";

const STATUS_LABELS = { pending: "Waiting for approval", confirmed: "Confirmed", ready: "Ready", rented: "Rented", returned: "Returned", completed: "Completed", cancelled: "Cancelled", rejected: "Rejected", overdue: "Overdue" };
const PROOF_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PROOF_BYTES = 5 * 1024 * 1024;

const formatDate = value => {
  const dateOnly = String(value || "").slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
  if (!match) return "Not available";
  const [, year, month, day] = match;
  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))));
};

const readableStatus = value => String(value || "Not available")
  .replace(/_/g, " ")
  .replace(/\b\w/g, letter => letter.toUpperCase());

export function CustomerBookingStatus() {
  const [bookingNo, setBookingNo] = useState("");
  const [email, setEmail] = useState("");
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [proofFile, setProofFile] = useState(null);
  const [proofError, setProofError] = useState("");
  const [uploadingProof, setUploadingProof] = useState(false);
  const [accessToken, setAccessToken] = useState(() => {
    const fragment = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
    return new URLSearchParams(fragment).get("access") || new URLSearchParams(window.location.search).get("access") || "";
  });

  useEffect(() => {
    if (!accessToken) return;
    // Remove the private token from the visible URL and browser history as
    // soon as the app has captured it in memory.
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.hash}`);
    setError("");
    setLoading(true);
    publicApi("/public/bookings/access", {
      method:"POST",
      body:JSON.stringify({token:accessToken})
    }).then(data => setBooking(data.booking)).catch(e => {
      setError(e.message);
      setAccessToken("");
    }).finally(() => setLoading(false));
  }, [accessToken]);

  const submit = async e => {
    e.preventDefault();
    setAccessToken("");
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
      if (accessToken) body.append("access_token", accessToken);
      else {
        body.append("booking_no", bookingNo.trim());
        body.append("email", email.trim());
      }
      body.append("payment_proof", proofFile);
      const data = await publicApiForm("/public/bookings/payment-proof", body);
      setBooking(current => ({...current,payment_proof_status:data.payment_proof_status,payment_proof_uploaded_at:data.payment_proof_uploaded_at,payment_proof_review_note:null,payment_verified_amount:null,payment_reference:null}));
      setProofFile(null);
    } catch (e) {
      setProofError(e.message);
    } finally {
      setUploadingProof(false);
    }
  };

  return <CustomerShell title={accessToken ? "Your rental booking" : "Check your rental status"} subtitle={accessToken ? "Review your booking and payment details below." : "Enter your booking number and the email you used to request it."}>
    {loading && accessToken && !booking && <section className="admin-card shop-status-link-loading" aria-live="polite">Opening your secure booking...</section>}

    {!accessToken && <section className="admin-card shop-booking-form shop-status-lookup">
      <form onSubmit={submit} className="shop-status-lookup-form">
        {error && <div className="login-error">{error}</div>}
        <div className="shop-status-fields">
          <label>Booking number<input value={bookingNo} onChange={e => setBookingNo(e.target.value)} placeholder="RF-000006" autoComplete="off" required /></label>
          <label>Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required /></label>
          <button type="submit" className={`primary-button ${loading ? "is-loading" : ""}`} disabled={loading} aria-busy={loading}>{loading ? "Checking..." : "Check status"}</button>
        </div>
      </form>
    </section>}

    {booking && <section className="admin-card shop-status-result" aria-live="polite">
      <div className="shop-status-heading">
        <div><span className="shop-status-reference">Booking {booking.booking_no}</span><h2>Rental details</h2></div>
        <span className={`status-pill ${booking.status}`}>{STATUS_LABELS[booking.status] || readableStatus(booking.status)}</span>
      </div>
      {accessToken && <p className="shop-status-private-note">You opened this booking through a private email link. Do not forward or share it.</p>}
      <dl className="shop-status-details">
        <div>
          <dt>Rental period</dt>
          <dd>{formatDate(booking.start_date)} <span>to</span> {formatDate(booking.end_date)}</dd>
        </div>
        <div>
          <dt>Total amount</dt>
          <dd>{peso(Number(booking.grand_total))}</dd>
        </div>
        <div className="shop-status-items">
          <dt>Rental items</dt>
          <dd>{booking.items.map(i => `${i.item_name} (${i.quantity})`).join(", ")}</dd>
        </div>
        <div>
          <dt>Payment status</dt>
          <dd>{readableStatus(booking.payment_status)}</dd>
        </div>
      </dl>
      {booking.payment_method === "gcash" && <div className="shop-status-payment">
        <h3>GCash payment</h3>
        {!booking.gcash_instructions_sent ? <p>Your GCash QR code and payment instructions will be emailed after Admin reviews and approves your request.</p> :
          ["cancelled","rejected","completed"].includes(booking.status) ? <p>This request is closed, so payment proof uploads are no longer available.</p> :
          booking.payment_proof_status === "submitted" ? <div className="shop-proof-complete"><strong>Payment proof under review</strong><span>Admin has received your screenshot. No further action is needed until the review is complete.</span></div> :
          <>
            {booking.payment_proof_status === "approved" && <div className="shop-proof-complete"><strong>Payment proof approved</strong><span>{peso(Number(booking.payment_verified_amount||0))} was verified and recorded{booking.payment_reference?` · Ref ${booking.payment_reference}`:""}.{Number(booking.balance_due||0)<=0?" Your booking is now fully paid.":` Remaining balance: ${peso(Number(booking.balance_due||0))}.`}</span></div>}
            {booking.payment_proof_status === "rejected" && <div className="shop-proof-rejected"><strong>Replacement screenshot required</strong><span>{booking.payment_proof_review_note}</span></div>}
            {(booking.payment_status === "paid" || Number(booking.balance_due||0)<=0) ? booking.payment_proof_status !== "approved"&&<div className="shop-proof-complete"><strong>Payment received</strong><span>Your booking is fully paid. No additional proof is needed.</span></div> :
            <form className="shop-proof-form" onSubmit={uploadProof}>
              <p>{booking.payment_proof_status === "rejected"?"Please upload a clear replacement screenshot.":booking.payment_proof_status === "approved"?`Your remaining balance is ${peso(Number(booking.balance_due||0))}. After paying it, upload the new screenshot below.`:"Payment instructions were sent to your registered email. After paying, upload your screenshot below."}</p>
              <label>Payment screenshot
                <input type="file" accept={PROOF_TYPES.join(",")} onChange={chooseProof} required />
              </label>
              {proofError && <div className="login-error">{proofError}</div>}
              <button className={`primary-button ${uploadingProof ? "is-loading" : ""}`} disabled={uploadingProof || !proofFile} aria-busy={uploadingProof}>{uploadingProof ? "Uploading…" : booking.payment_proof_status === "rejected"?"Upload Replacement Proof":"Upload Payment Proof"}</button>
              <small>JPG, PNG, or WebP · up to 5MB</small>
            </form>}
          </>}
      </div>}
    </section>}
  </CustomerShell>;
}
