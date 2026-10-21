import React, { useEffect } from "react";
import { ENTRY_STATUS_LABELS, TYPE_LABELS } from "../../lib/calendarDates";

// Entry types an admin can add. "booking" is a read-only rental shown from
// Bookings, but the API still accepts it as an entry type, so it stays pickable.
const TYPE_ORDER=["reservation","event","note","booking"];

// The add/edit form, grouped into When / Customer / Notes. The payload is the
// same flat form object the API has always taken.
export function EntryEditor({editor,setEditor,saving,error,onSave,onClose}){
  const {form}=editor;
  const set=patch=>setEditor({...editor,form:{...form,...patch}});
  const field=name=>({value:form[name],onChange:e=>set({[name]:e.target.value})});
  const ready=form.title.trim()!==""&&form.entry_date!=="";

  useEffect(()=>{
    const onKey=e=>{if(e.key==="Escape") onClose()};
    document.addEventListener("keydown",onKey);
    return()=>document.removeEventListener("keydown",onKey);
  },[onClose]);

  return <div className="modal-backdrop" onClick={onClose}>
    <div className="modal cal-entry-modal" role="dialog" aria-modal="true" aria-label={editor.id?"Update calendar entry":"New calendar entry"} onClick={e=>e.stopPropagation()}>
      <div className="modal-head">
        <div><span className="eyebrow">{editor.id?"Edit Entry":"New Entry"}</span><h2>{editor.id?"Update Calendar Entry":`New ${TYPE_LABELS[form.entry_type]}`}</h2></div>
        <button type="button" onClick={onClose} aria-label="Close">×</button>
      </div>

      {error&&<div className="login-error" role="alert">{error}</div>}

      <div className="cal-form">
        <div className="cal-form-block">
          <span className="cal-form-label" id="cal-type-label">Type</span>
          <div className="cal-type-chips" role="radiogroup" aria-labelledby="cal-type-label">
            {TYPE_ORDER.map(type=><button key={type} type="button" role="radio" aria-checked={form.entry_type===type} className={`cal-type-chip cal-tone-${type}${form.entry_type===type?" active":""}`} onClick={()=>set({entry_type:type})}>
              <i className="cal-dot" aria-hidden="true"/>{TYPE_LABELS[type]}
            </button>)}
          </div>
        </div>

        <label className="cal-field">Title
          <input required autoFocus placeholder="What is scheduled?" {...field("title")}/>
        </label>

        <fieldset className="cal-form-section">
          <legend>When</legend>
          <div className="cal-form-grid">
            <label className="cal-field">Date<input type="date" required {...field("entry_date")}/></label>
            <label className="cal-field">Status
              <select {...field("status")}>{Object.entries(ENTRY_STATUS_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
            </label>
            <label className="cal-field">Start time<input type="time" {...field("start_time")}/></label>
            <label className="cal-field">End time<input type="time" {...field("end_time")}/></label>
            <label className="cal-field cal-wide">Reminder<input type="datetime-local" {...field("reminder_at")}/></label>
          </div>
        </fieldset>

        <fieldset className="cal-form-section">
          <legend>Customer and place</legend>
          <div className="cal-form-grid">
            <label className="cal-field">Customer name<input placeholder="Optional" {...field("customer_name")}/></label>
            <label className="cal-field">Contact number<input inputMode="tel" placeholder="Optional" {...field("customer_phone")}/></label>
            <label className="cal-field cal-wide">Customer email<input type="email" placeholder="Optional" {...field("customer_email")}/></label>
            <label className="cal-field">Location<input placeholder="Optional" {...field("location")}/></label>
            <label className="cal-field">Guests<input type="number" min="0" inputMode="numeric" placeholder="Optional" {...field("guests")}/></label>
          </div>
        </fieldset>

        <fieldset className="cal-form-section">
          <legend>Details</legend>
          <div className="cal-form-grid">
            <label className="cal-field cal-wide">Details<textarea rows="3" placeholder="Optional" {...field("details")}/></label>
            <label className="cal-field cal-wide">Notes<textarea rows="2" placeholder="Optional" {...field("notes")}/></label>
          </div>
        </fieldset>
      </div>

      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
        <button type="button" className="primary-button" onClick={onSave} disabled={saving||!ready}>{saving?"Saving...":editor.id?"Save Changes":"Add to Calendar"}</button>
      </div>
    </div>
  </div>;
}
