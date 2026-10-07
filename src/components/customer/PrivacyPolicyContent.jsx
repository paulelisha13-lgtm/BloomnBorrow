import React from "react";

export function PrivacyPolicyContent({ business }) {
  const name=business?.business_name || "Bloom & Borrow";
  return <div className="shop-privacy-policy-content">
    <p>At {name}, we respect your privacy and are committed to protecting the personal information you provide when using our Rental Management System.</p>

    <h2>Information we collect</h2>
    <p>We collect information needed to process and verify your rental request:</p>
    <ul>
      <li>Your name and contact details</li>
      <li>Your complete address</li>
      <li>Rental and booking information</li>
      <li>One uploaded identification document</li>
    </ul>

    <h2>How we use your information</h2>
    <ul>
      <li>Process and manage rental requests</li>
      <li>Verify customer identity</li>
      <li>Manage bookings, payments, and inventory</li>
      <li>Send rental status and payment updates</li>
      <li>Maintain accurate transaction records</li>
    </ul>

    <h2>Your information is private</h2>
    <p>Your personal information and uploaded ID are not publicly displayed. Access is limited to authorized personnel who need the information to verify or manage your rental. We do not intentionally sell your personal information.</p>

    <h2>Data security and retention</h2>
    <p>We use reasonable safeguards against unauthorized access, loss, misuse, or disclosure. Information is retained only as necessary for rental records, business operations, security, and applicable requirements.</p>

    <h2>Your rights</h2>
    <p>Where applicable, you may request access to, correction of, or deletion of your personal information and ask how your information is being used.</p>

    <h2>Contact us</h2>
    <ul>
      <li>Business: {name}</li>
      {business?.business_email && <li>Email: {business.business_email}</li>}
      {business?.business_phone && <li>Contact: {business.business_phone}</li>}
    </ul>

    <h2>Customer acknowledgment</h2>
    <p>By submitting a rental request, you acknowledge that you understand this Privacy Policy and consent to the processing of your information for purposes related to your rental transaction.</p>
  </div>;
}
