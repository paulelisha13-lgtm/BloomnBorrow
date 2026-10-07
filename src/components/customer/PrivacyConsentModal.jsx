import React, { useEffect, useRef, useState } from "react";

// Gates the rental form behind a real read: the "I Agree" button stays
// disabled until the customer has scrolled the policy text to its end.
export function PrivacyConsentModal({ business, onAgree, onDecline }) {
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const name = business?.business_name || "Bloom & Borrow";
  const textRef=useRef(null);

  useEffect(()=>{
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    textRef.current?.focus();
    const onKeyDown=e=>{if(e.key==="Escape")onDecline()};
    window.addEventListener("keydown",onKeyDown);
    return()=>{window.removeEventListener("keydown",onKeyDown);document.body.style.overflow=previousOverflow};
  },[onDecline]);

  const onScroll = e => {
    const el = e.target;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setScrolledToEnd(true);
  };

  return <div className="modal-backdrop"><div className="modal confirm-modal shop-privacy-modal" role="dialog" aria-modal="true" aria-labelledby="privacy-title" aria-describedby="privacy-summary">
    <h3 id="privacy-title">Privacy Policy</h3>
    <p id="privacy-summary" className="shop-privacy-summary">Please review how your information is used before continuing.</p>
    <div ref={textRef} className="shop-privacy-text" onScroll={onScroll} tabIndex="0" aria-label="Privacy policy text">
      <p>At {name}, we respect your privacy and are committed to protecting the personal information you provide when using our Rental Management System.</p>

      <strong>Information We Collect</strong>
      <p>We may collect information necessary to process your rental, such as:</p>
      <ul>
        <li>Customer information</li>
        <li>Contact details</li>
        <li>Rental and booking information</li>
        <li>Uploaded identification documents, when required</li>
      </ul>

      <strong>How We Use Your Information</strong>
      <p>Your information is used only for legitimate rental-related purposes, including:</p>
      <ul>
        <li>Processing and managing rental requests</li>
        <li>Verifying customer identity</li>
        <li>Managing bookings and inventory</li>
        <li>Communicating rental updates and notifications</li>
        <li>Maintaining accurate transaction records</li>
      </ul>

      <strong>Your Information Is Private</strong>
      <p>Your personal information and uploaded ID are not publicly displayed. Access is limited to authorized personnel who need the information to process, verify, or manage your rental. We do not intentionally sell or publicly disclose your personal information.</p>

      <strong>Data Security</strong>
      <p>We take reasonable measures to protect your information from unauthorized access, loss, misuse, or disclosure. However, no online system can guarantee complete protection against every possible security incident.</p>

      <strong>Data Retention</strong>
      <p>Your information may be retained as long as necessary for rental records, business operations, security, and applicable legal requirements. When information is no longer necessary, it should be securely deleted or disposed of according to applicable requirements.</p>

      <strong>Your Rights</strong>
      <p>Where applicable, you may request access to, correction of, or deletion of your personal information and ask how your information is being used.</p>

      <strong>Contact Us</strong>
      <p>For privacy questions or concerns, contact us:</p>
      <ul>
        <li>Business: {name}</li>
        {business?.business_email && <li>Email: {business.business_email}</li>}
        {business?.business_phone && <li>Contact: {business.business_phone}</li>}
      </ul>

      <strong>Customer Acknowledgment</strong>
      <p>By using our system and submitting a rental request, you acknowledge that you have read and understood this Privacy Policy and agree to the processing of your information for purposes related to your rental transaction.</p>
    </div>
    {!scrolledToEnd && <p className="muted shop-privacy-hint" role="status">Scroll to the end to enable “I Agree”.</p>}
    <div className="confirm-modal-actions">
      <button type="button" className="secondary-button" data-customer-nav onClick={onDecline}>Decline</button>
      <button type="button" className="primary-button" disabled={!scrolledToEnd} onClick={onAgree}>I Agree</button>
    </div>
  </div></div>;
}
