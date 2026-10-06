import React, { useState } from "react";

// Confirmation shown before a form with unsaved input is closed. The backdrop
// has no click handler and Escape is not handled, so it can only be answered
// with one of the two buttons -- an accidental click outside can never throw
// away what was typed.
export function DiscardChangesModal({ onKeep, onDiscard }) {
  return <div className="modal-backdrop discard-backdrop" role="presentation">
    <div className="modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="discard-title" aria-describedby="discard-desc">
      <h3 id="discard-title">Discard changes?</h3>
      <p id="discard-desc">You have unsaved changes. Are you sure you want to exit? Your entered information will be lost.</p>
      <div className="confirm-modal-actions">
        <button type="button" className="secondary-button" autoFocus onClick={onKeep}>Keep editing</button>
        <button type="button" className="danger-button" onClick={onDiscard}>Discard and exit</button>
      </div>
    </div>
  </div>;
}

// Wrap a form's close actions (backdrop, ×, Cancel) in requestClose. When
// isDirty is false it closes straight away; otherwise it asks first. Render
// discardDialog after the form so it stacks on top of it.
export function useDiscardGuard(isDirty, onClose) {
  const [asking, setAsking] = useState(false);
  const requestClose = () => { if (isDirty) setAsking(true); else onClose(); };
  const discardDialog = asking
    ? <DiscardChangesModal onKeep={() => setAsking(false)} onDiscard={() => { setAsking(false); onClose(); }} />
    : null;
  return { requestClose, discardDialog };
}
