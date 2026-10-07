import React, { useEffect, useRef, useState } from "react";
import { PrivacyPolicyContent } from "./PrivacyPolicyContent";

// Gates the rental form behind a real read: the "I Agree" button stays
// disabled until the customer has scrolled the policy text to its end.
export function PrivacyConsentModal({ business, onAgree, onDecline }) {
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
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
      <PrivacyPolicyContent business={business}/>
    </div>
    {!scrolledToEnd && <p className="muted shop-privacy-hint" role="status">Scroll to the end to enable “I Agree”.</p>}
    <div className="confirm-modal-actions">
      <button type="button" className="secondary-button" data-customer-nav onClick={onDecline}>Decline</button>
      <button type="button" className="primary-button" disabled={!scrolledToEnd} onClick={onAgree}>I Agree</button>
    </div>
  </div></div>;
}
