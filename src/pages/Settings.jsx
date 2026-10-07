import React, { useState } from "react";
import { api } from "../lib/api";
import { AdminShell } from "../components/layout/AdminShell";

const POLICY_PLACEHOLDERS={
  free_delivery_area:"Biclatan, General Trias, Cavite and nearby areas confirmed by Bloom & Borrow",
  delivery_policy:"Explain how fees for farther locations are reviewed and confirmed.",
  rental_care_policy:"Explain the renter's responsibility for proper use, handling, and safekeeping.",
  loss_damage_policy:"Explain how missing, lost, or damaged items are assessed and charged.",
  inspection_policy:"Explain the release and return inspection process.",
  cancellation_policy:"Explain cancellation deadlines, eligibility, and refund handling."
};

export function Settings() {
  const [form,setForm]=useState({});
  const [saved,setSaved]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");

  React.useEffect(()=>{api("/admin/settings").then(d=>setForm(d.settings||{})).catch(e=>setError(e.message))},[]);
  const update=(key,value)=>setForm(current=>({...current,[key]:value}));
  const save=async event=>{
    event.preventDefault();
    setSaving(true);setError("");setSaved(false);
    try{
      const data=await api("/admin/settings",{method:"PUT",body:JSON.stringify(form)});
      if(data.rental_terms_version)setForm(current=>({...current,rental_terms_version:data.rental_terms_version}));
      setSaved(true);
      setTimeout(()=>setSaved(false),2500);
    }catch(e){setError(e.message)}finally{setSaving(false)}
  };

  const version=form.rental_terms_version;
  const versionDate=version&&/^\d{4}-\d{2}-\d{2}T/.test(version)&&!Number.isNaN(Date.parse(version))
    ? new Date(version).toLocaleString("en-PH",{year:"numeric",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})
    : version||"1.0";

  return <AdminShell title="Settings" subtitle="Manage business details, rental policies, fees, and customer communication.">
    {error&&<div className="login-error" role="alert">{error}</div>}
    <form className="settings-page-form" onSubmit={save}>
      <section className="admin-card settings-section">
        <div className="settings-section-head"><div><span>Business profile</span><h2>Public contact information</h2><p>Shown to customers in the shop, policies, and invoices.</p></div></div>
        <div className="form-grid settings-grid">
          <label>Business name<input value={form.business_name||""} onChange={e=>update("business_name",e.target.value)}/></label>
          <label>Currency<input value={form.currency||"PHP"} onChange={e=>update("currency",e.target.value)}/></label>
          <label>Business email<input type="email" value={form.business_email||""} onChange={e=>update("business_email",e.target.value)}/></label>
          <label>Business phone<input value={form.business_phone||""} onChange={e=>update("business_phone",e.target.value)}/></label>
          <label className="span-2">Business address<input value={form.business_address||""} onChange={e=>update("business_address",e.target.value)}/></label>
          <label>Facebook page URL<input type="url" value={form.business_facebook||""} onChange={e=>update("business_facebook",e.target.value)} placeholder="https://facebook.com/..."/></label>
          <label>Instagram URL<input type="url" value={form.business_instagram||""} onChange={e=>update("business_instagram",e.target.value)} placeholder="https://instagram.com/..."/></label>
        </div>
      </section>

      <section className="admin-card settings-section">
        <div className="settings-section-head"><div><span>Fees &amp; fulfillment</span><h2>Delivery and late returns</h2><p>Customers see the coverage policy; staff still confirm the exact delivery fee per request.</p></div></div>
        <div className="form-grid settings-grid">
          <label>Reference delivery fee<input min="0" step="0.01" type="number" value={form.delivery_fee||0} onChange={e=>update("delivery_fee",e.target.value)}/><small>Used as an internal reference. Staff can confirm free delivery or enter a different quote.</small></label>
          <label>Late fee per day<input min="0" step="0.01" type="number" value={form.late_fee_per_day||0} onChange={e=>update("late_fee_per_day",e.target.value)}/><small>Displayed automatically in the rental terms.</small></label>
          <label className="span-2">Free delivery coverage<input value={form.free_delivery_area||""} onChange={e=>update("free_delivery_area",e.target.value)} placeholder={POLICY_PLACEHOLDERS.free_delivery_area}/><small>Use a clear service area. “Nearby” remains subject to staff verification.</small></label>
          <label className="span-2">Delivery policy<textarea rows="4" value={form.delivery_policy||""} onChange={e=>update("delivery_policy",e.target.value)} placeholder={POLICY_PLACEHOLDERS.delivery_policy}/></label>
        </div>
        <div className="settings-advice"><strong>Recommended delivery flow</strong><p>Review the full address, open it in Maps, then confirm ₱0 for free coverage or enter the distance-based fee before approving the booking.</p></div>
      </section>

      <section className="admin-card settings-section">
        <div className="settings-section-head"><div><span>Customer policy</span><h2>Rental Terms &amp; Conditions</h2><p>These sections appear in checkout and on the public Rental Terms page.</p></div><span className="settings-version">Current policy: {versionDate}</span></div>
        <div className="form-grid settings-grid settings-policy-grid">
          <label className="span-2">Care of rental items<textarea rows="4" value={form.rental_care_policy||""} onChange={e=>update("rental_care_policy",e.target.value)} placeholder={POLICY_PLACEHOLDERS.rental_care_policy}/></label>
          <label className="span-2">Loss, damage, and missing items<textarea rows="4" value={form.loss_damage_policy||""} onChange={e=>update("loss_damage_policy",e.target.value)} placeholder={POLICY_PLACEHOLDERS.loss_damage_policy}/></label>
          <label className="span-2">Cancellation and refunds<textarea rows="4" value={form.cancellation_policy||""} onChange={e=>update("cancellation_policy",e.target.value)} placeholder={POLICY_PLACEHOLDERS.cancellation_policy}/></label>
          <label className="span-2">Inspection policy<textarea rows="4" value={form.inspection_policy||""} onChange={e=>update("inspection_policy",e.target.value)} placeholder={POLICY_PLACEHOLDERS.inspection_policy}/></label>
        </div>
        <p className="settings-policy-note">Saving a policy change creates a new policy version. Each customer booking stores the version and complete terms accepted at submission.</p>
      </section>

      <section className="admin-card settings-section">
        <div className="settings-section-head"><div><span>Notifications</span><h2>Customer status emails</h2><p>Keep customers informed as their rental moves through the workflow.</p></div></div>
        <label className="settings-check"><input type="checkbox" checked={String(form.notification_email_enabled??"1")==="1"} onChange={e=>update("notification_email_enabled",e.target.checked?"1":"0")}/><span><strong>Automatic customer status emails</strong><small>Send branded emails for submission, approval, rejection, rescheduling, readiness, rental, return, overdue, cancellation, and completion.</small></span></label>
      </section>

      <div className="settings-save-bar">
        <p>{saved?"Settings saved. The latest customer policies are now active.":"Changes apply to future rental requests."}</p>
        <button className={`primary-button ${saving?"is-loading":""}`} disabled={saving}>{saving?"Saving…":saved?"Saved ✓":"Save settings"}</button>
      </div>
    </form>
  </AdminShell>;
}
