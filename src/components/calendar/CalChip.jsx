import React from "react";
import { describeActivity, timeLabel } from "../../lib/calendarDates";

const DONE=new Set(["completed","returned"]);
const VOID=new Set(["cancelled","rejected"]);

// Visual state shared by chips, cards and the sidebar dots.
export const stateClass=status=>DONE.has(status)?"is-done":VOID.has(status)?"is-void":status==="pending"?"is-pending":status==="overdue"?"is-overdue":"";

// "9:00 AM" -> "9:00a" so a chip stays on one line.
const shortTime=value=>timeLabel(value).replace(" AM","a").replace(" PM","p");

// One activity on one day. variant "chip" is the single-line month chip,
// "card" is the roomier block used by the week and day views.
export function CalChip({item,day,onOpen,variant="chip"}){
  const d=describeActivity(item,day);
  const state=stateClass(d.status);
  const label=`${d.code?`${d.code}, `:""}${d.title}${d.time?` at ${timeLabel(d.time)}`:""}${d.marker?`, ${d.marker}`:""}, ${d.statusLabel}`;
  const open=()=>onOpen(day);

  if(variant==="card") return <button type="button" className={`cal-card-item cal-tone-${d.tone} ${state}`} onClick={open} aria-label={label}>
    <span className="cal-card-item-top">
      <span className="cal-card-item-time">{d.time?timeLabel(d.time):d.code||"All day"}</span>
      {d.marker&&<span className="cal-marker">{d.marker}</span>}
      <span className="cal-card-item-status">{state==="is-done"&&"✓ "}{d.statusLabel}</span>
    </span>
    <strong>{d.title}</strong>
    {d.sub&&<span className="cal-card-item-sub">{d.sub}</span>}
  </button>;

  return <button type="button" className={`cal-chip cal-tone-${d.tone} ${state}`} onClick={open} aria-label={label} title={`${d.code?`${d.code} · `:""}${d.title}`}>
    {state==="is-done"&&<span aria-hidden="true">✓ </span>}
    {d.time&&<em>{shortTime(d.time)}</em>}
    <span className="cal-chip-title">{d.title}</span>
    {d.marker&&<span className="cal-marker">{d.marker}</span>}
  </button>;
}
