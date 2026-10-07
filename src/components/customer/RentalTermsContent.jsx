import React from "react";

function versionLabel(version) {
  if (!version) return "Version 1.0";
  const parsed=/^\d{4}-\d{2}-\d{2}T/.test(version)?Date.parse(version):NaN;
  if (!Number.isNaN(parsed)) return `Updated ${new Date(parsed).toLocaleDateString("en-PH",{year:"numeric",month:"long",day:"numeric"})}`;
  return `Version ${version}`;
}

export function RentalTermsContent({ terms }) {
  if (!terms) return <div className="shop-policy-loading" role="status">Loading rental terms…</div>;

  return <div className="shop-policy-document">
    <div className="shop-policy-meta">
      <span>{versionLabel(terms.version)}</span>
      <span>Applies to customer rental requests</span>
    </div>
    <div className="shop-policy-intro">
      <strong>Please read before submitting a rental request.</strong>
      <p>These terms explain the booking review, delivery, care, return, and payment responsibilities between you and {terms.business_name || "Bloom & Borrow"}.</p>
    </div>
    <ol className="shop-policy-sections">
      {(terms.sections || []).map(section => <li key={section.id} id={`terms-${section.id}`}>
        <div className="shop-policy-number" aria-hidden="true" />
        <div>
          <h2>{section.title}</h2>
          {(section.paragraphs || []).map((paragraph,index) => <p key={index}>{paragraph}</p>)}
          {section.bullets?.length > 0 && <ul>{section.bullets.map((item,index) => <li key={index}>{item}</li>)}</ul>}
        </div>
      </li>)}
    </ol>
    {(terms.contact?.email || terms.contact?.phone || terms.contact?.address) && <div className="shop-policy-contact">
      <strong>Questions about these terms?</strong>
      <p>Contact {terms.business_name || "Bloom & Borrow"} before submitting your request.</p>
      <div>
        {terms.contact.email && <a href={`mailto:${terms.contact.email}`}>{terms.contact.email}</a>}
        {terms.contact.phone && <a href={`tel:${terms.contact.phone}`}>{terms.contact.phone}</a>}
        {terms.contact.address && <span>{terms.contact.address}</span>}
      </div>
    </div>}
  </div>;
}
