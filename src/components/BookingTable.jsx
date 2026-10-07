import React from "react";
import { peso } from "../lib/format";

export function BookingTable({ rows=[] }) {
  if(!rows.length)return <div className="shared-empty-state"><strong>No recent bookings</strong><span>New reservations will appear here.</span></div>;
  return <div className="table-wrap dashboard-booking-table"><table>
    <caption className="sr-only">Recent bookings</caption>
    <thead><tr><th scope="col">Booking</th><th scope="col">Customer</th><th scope="col">Item</th><th scope="col">Dates</th><th scope="col">Total</th><th scope="col">Status</th></tr></thead>
    <tbody>{rows.map(b=><tr key={b.id}>
      <td data-label="Booking"><strong>{b.id}</strong></td>
      <td data-label="Customer">{b.customer}</td>
      <td data-label="Item">{b.item}</td>
      <td data-label="Dates">{b.dates}</td>
      <td data-label="Total" className="num">{peso(b.total)}</td>
      <td data-label="Status"><span className={`status-pill ${b.status.toLowerCase()}`}>{b.status}</span></td>
    </tr>)}</tbody>
  </table></div>
}
