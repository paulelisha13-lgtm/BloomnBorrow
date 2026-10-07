import React, { useEffect, useRef } from "react";
import { RentalTermsContent } from "./RentalTermsContent";

export function RentalTermsModal({ terms, onClose }) {
  const closeRef=useRef(null);

  useEffect(()=>{
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    closeRef.current?.focus();
    const onKeyDown=event=>{if(event.key==="Escape")onClose()};
    window.addEventListener("keydown",onKeyDown);
    return()=>{window.removeEventListener("keydown",onKeyDown);document.body.style.overflow=previousOverflow};
  },[onClose]);

  return <div className="modal-backdrop shop-terms-backdrop" onClick={onClose}>
    <div className="modal shop-terms-modal" role="dialog" aria-modal="true" aria-labelledby="rental-terms-title" onClick={event=>event.stopPropagation()}>
      <div className="shop-terms-modal-head">
        <div><span>Before you submit</span><h1 id="rental-terms-title">Rental Terms &amp; Conditions</h1></div>
        <button ref={closeRef} type="button" className="booking-modal-close" onClick={onClose} aria-label="Close rental terms">×</button>
      </div>
      <div className="shop-terms-modal-body"><RentalTermsContent terms={terms}/></div>
      <div className="shop-terms-modal-foot">
        <p>You can return to your request after reviewing these terms.</p>
        <button type="button" className="primary-button" onClick={onClose}>Done reviewing</button>
      </div>
    </div>
  </div>;
}
