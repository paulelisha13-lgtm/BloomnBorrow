import React, { useState } from "react";
import { api } from "../lib/api";
import { AdminShell } from "../components/layout/AdminShell";

export function Settings() {
  const [form,setForm]=useState({}); const [saved,setSaved]=useState(false); const [error,setError]=useState("");
  React.useEffect(()=>{api("/admin/settings").then(d=>setForm(d.settings||{})).catch(e=>setError(e.message))},[]);
  const save=async(e)=>{e.preventDefault();try{await api("/admin/settings",{method:"PUT",body:JSON.stringify(form)});setSaved(true);setTimeout(()=>setSaved(false),2000)}catch(e){setError(e.message)}};
  return <AdminShell title="Settings" subtitle="Business information, fees, policies, and notification configuration.">{error&&<div className="login-error">{error}</div>}<form className="admin-card settings-form" onSubmit={save}><div className="form-grid">
    <label>Business name<input value={form.business_name||""} onChange={e=>setForm({...form,business_name:e.target.value})}/></label><label>Currency<input value={form.currency||"PHP"} onChange={e=>setForm({...form,currency:e.target.value})}/></label>
    <label>Email<input value={form.business_email||""} onChange={e=>setForm({...form,business_email:e.target.value})}/></label><label>Phone<input value={form.business_phone||""} onChange={e=>setForm({...form,business_phone:e.target.value})}/></label>
    <label className="span-2">Address<input value={form.business_address||""} onChange={e=>setForm({...form,business_address:e.target.value})}/></label>
    <label>Facebook page URL<input value={form.business_facebook||""} onChange={e=>setForm({...form,business_facebook:e.target.value})} placeholder="https://facebook.com/..."/></label><label>Instagram URL<input value={form.business_instagram||""} onChange={e=>setForm({...form,business_instagram:e.target.value})} placeholder="https://instagram.com/..."/></label>
    <label>Delivery fee<input type="number" value={form.delivery_fee||0} onChange={e=>setForm({...form,delivery_fee:e.target.value})}/></label><label>Late fee / day<input type="number" value={form.late_fee_per_day||0} onChange={e=>setForm({...form,late_fee_per_day:e.target.value})}/></label>
    <label className="span-2">Cancellation policy<textarea value={form.cancellation_policy||""} onChange={e=>setForm({...form,cancellation_policy:e.target.value})}/></label>
    <label className="span-2 settings-check"><input type="checkbox" checked={String(form.notification_email_enabled??"1")==="1"} onChange={e=>setForm({...form,notification_email_enabled:e.target.checked?"1":"0"})}/><span><strong>Automatic customer status emails</strong><small>Send branded emails for submission, approval, rejection, rescheduling, readiness, rental, return, overdue, cancellation, and completion.</small></span></label>
  </div><button className="primary-button">{saved?"Saved ✓":"Save settings"}</button></form></AdminShell>
}
