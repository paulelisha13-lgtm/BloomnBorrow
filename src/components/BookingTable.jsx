import React from "react";
import { peso } from "../lib/format";

export function BookingTable({ rows=[] }) {
  return <div className="table-wrap"><table><thead><tr><th>Booking</th><th>Customer</th><th>Item</th><th>Dates</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>{rows.map(b=><tr key={b.id}><td><strong>{b.id}</strong></td><td>{b.customer}</td><td>{b.item}</td><td>{b.dates}</td><td>{peso(b.total)}</td><td><span className={`status-pill ${b.status.toLowerCase()}`}>{b.status}</span></td><td>•••</td></tr>)}</tbody></table></div>
}
