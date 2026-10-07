import React, { useEffect, useState } from "react";
import { CustomerShell } from "../../components/customer/CustomerShell";
import { PrivacyPolicyContent } from "../../components/customer/PrivacyPolicyContent";
import { RentalTermsContent } from "../../components/customer/RentalTermsContent";
import { publicApi } from "../../lib/publicApi";

function usePolicies() {
  const [data,setData]=useState({business:null,terms:null,error:""});
  useEffect(()=>{
    publicApi("/public/business-info")
      .then(response=>setData({business:response.business||{},terms:response.rental_terms||null,error:""}))
      .catch(error=>setData(current=>({...current,error:error.message})));
  },[]);
  return data;
}

export function CustomerRentalTerms() {
  const {terms,error}=usePolicies();
  return <CustomerShell eyebrow="Customer policy" title="Rental Terms & Conditions" subtitle="Clear rules for booking approval, delivery, item care, returns, and cancellations.">
    {error&&<div className="shop-inline-alert" role="alert"><div><strong>We couldn't load the rental terms.</strong><span>{error}</span></div></div>}
    {!error&&<section className="admin-card shop-policy-page"><RentalTermsContent terms={terms}/></section>}
  </CustomerShell>;
}

export function CustomerPrivacyPolicy() {
  const {business,error}=usePolicies();
  return <CustomerShell eyebrow="Customer policy" title="Privacy Policy" subtitle="How Bloom & Borrow collects, uses, protects, and retains your information.">
    {error&&<div className="shop-inline-alert" role="alert"><div><strong>We couldn't load the privacy policy.</strong><span>{error}</span></div></div>}
    {!error&&<section className="admin-card shop-policy-page shop-privacy-page">{business?<PrivacyPolicyContent business={business}/>:<div className="shop-policy-loading" role="status">Loading privacy policy…</div>}</section>}
  </CustomerShell>;
}
