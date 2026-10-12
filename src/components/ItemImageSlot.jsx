import React, { useRef, useState } from "react";

// One photo slot in the admin item form: a preview (shown whole, never cropped)
// next to the web address field, with Replace / Remove acting on this slot only.
// Photos are web addresses -- there is no file hosting -- so "Replace" jumps to
// the field to paste a new address, and "Remove" clears just this slot.
function Preview({ src, alt }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="item-image-error">Can’t load this image</span>;
  return <img src={src} alt={alt} onError={() => setFailed(true)} />;
}

export function ItemImageSlot({ label, hint, value, onChange }) {
  const inputRef = useRef(null);
  const has = Boolean(String(value || "").trim());
  return <div className={`item-image-slot ${has?"has-image":"is-empty"}`}>
    <div className="item-image-preview">
      {has ? <Preview key={value} src={value.trim()} alt={`${label} preview`} /> : <span className="item-image-empty"><b aria-hidden="true">+</b>No photo added</span>}
    </div>
    <div className="item-image-controls">
      <label><span className="item-field-label">{label}{hint&&<i>{hint}</i>}</span>
        <input
          ref={inputRef}
          type="text"
          inputMode="url"
          autoComplete="off"
          maxLength={500}
          placeholder="Paste image URL"
          value={value || ""}
          onChange={event => onChange(event.target.value)}
        />
      </label>
      {has&&<div className="item-image-actions">
        <button type="button" className="mini-button" onClick={() => { inputRef.current?.focus(); inputRef.current?.select(); }}>Replace URL</button>
        <button type="button" className="mini-button danger" onClick={() => onChange("")}>Remove</button>
      </div>}
    </div>
  </div>;
}
