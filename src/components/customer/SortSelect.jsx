import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

const SHEET_QUERY = "(max-width:650px)";

const useIsSheet = () => {
  const get = () => typeof window !== "undefined" && window.matchMedia?.(SHEET_QUERY).matches;
  const [sheet, setSheet] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia?.(SHEET_QUERY);
    if (!mq) return undefined;
    const onChange = () => setSheet(mq.matches);
    onChange();
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return sheet;
};

// A themed replacement for the native <select> used to sort the catalog. The
// native popup can't be styled and looks oversized on phones, so on desktop
// this opens an anchored listbox and on narrow screens a bottom sheet with
// large touch targets. Keyboard: Arrow keys / Home / End move, Enter or Space
// picks, Escape closes and returns focus to the trigger.
export function SortSelect({ label = "Sort by", options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const sheet = useIsSheet();
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const labelId = useId();
  const listId = useId();

  const selectedIndex = Math.max(0, options.findIndex(o => o.value === value));
  const selected = options[selectedIndex];

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  const openMenu = () => {
    setActive(selectedIndex);
    setOpen(true);
  };

  const pick = index => {
    const option = options[index];
    if (option) onChange(option.value);
    close();
  };

  // Move focus into the list while it's open so arrow keys work immediately.
  useEffect(() => {
    if (open) listRef.current?.focus({ preventScroll: true });
  }, [open]);

  // Dismiss on outside press (the sheet has its own backdrop) or Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = e => {
      if (sheet) return;
      if (!rootRef.current?.contains(e.target)) close(false);
    };
    const onKey = e => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, sheet, close]);

  // Stop the page scrolling behind the bottom sheet.
  useEffect(() => {
    if (!open || !sheet) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open, sheet]);

  // Resizing from phone to desktop mid-open would leave a stale sheet behind.
  useEffect(() => { setOpen(false); }, [sheet]);

  const onTriggerKey = e => {
    if (["ArrowDown", "ArrowUp"].includes(e.key)) {
      e.preventDefault();
      openMenu();
    }
  };

  const onListKey = e => {
    const last = options.length - 1;
    const move = next => { e.preventDefault(); setActive(next); };
    if (e.key === "ArrowDown") move(active >= last ? 0 : active + 1);
    else if (e.key === "ArrowUp") move(active <= 0 ? last : active - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(last);
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(active); }
    else if (e.key === "Tab") close(false);
  };

  const list = (
    <ul
      id={listId}
      ref={listRef}
      className="sort-select-list"
      role="listbox"
      tabIndex={-1}
      aria-labelledby={labelId}
      aria-activedescendant={`${listId}-${active}`}
      onKeyDown={onListKey}
    >
      {options.map((option, index) => {
        const isSelected = option.value === value;
        return (
          <li
            key={option.value}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={isSelected}
            className={`sort-select-option${isSelected ? " is-selected" : ""}${index === active ? " is-active" : ""}`}
            onPointerEnter={() => setActive(index)}
            onClick={() => pick(index)}
          >
            <span>{option.label}</span>
            {isSelected && <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="sort-select" ref={rootRef}>
      <span className="sort-select-label" id={labelId}>{label}</span>
      <button
        type="button"
        ref={triggerRef}
        className="sort-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={`${labelId} ${labelId}-value`}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onTriggerKey}
        data-no-page-loading
      >
        <span className="sort-select-value" id={`${labelId}-value`}>{selected?.label}</span>
        <svg className="sort-select-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      </button>

      {open && !sheet && <div className="sort-select-popover">{list}</div>}

      {open && sheet && createPortal(
        <div className="sort-sheet-backdrop" onClick={() => close()}>
          <div className="sort-sheet" role="dialog" aria-modal="true" aria-label={label} onClick={e => e.stopPropagation()}>
            <span className="sort-sheet-grip" aria-hidden="true" />
            <div className="sort-sheet-head">
              <strong>{label}</strong>
              <button type="button" className="sort-sheet-close" aria-label="Close" onClick={() => close()}>×</button>
            </div>
            {list}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
