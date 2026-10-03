import { bookingDetailById } from "./bookings.js";
import { escHtml, peso } from "./format.js";
import { sendMail } from "./mailer.js";
import { addNotification } from "./notifications.js";
import { getSettings } from "./settings.js";
import { toDateOnly } from "./dates.js";

const SETTINGS = ["notification_email_enabled","business_name","business_email","business_phone","business_address"];

const titleCase = value => String(value || "").replace(/_/g," ").replace(/\b\w/g,char=>char.toUpperCase());
const longDate = value => {
  const raw=toDateOnly(value);
  if(!raw)return "";
  const [year,month,day]=raw.split("-").map(Number);
  return new Intl.DateTimeFormat("en-PH",{year:"numeric",month:"long",day:"numeric",timeZone:"UTC"}).format(new Date(Date.UTC(year,month-1,day)));
};

function eventCopy(booking,event,context) {
  const reason=String(context.note||"").trim();
  const copies={
    submitted:{heading:"Rental request received",message:`We received your rental request and it is waiting for Admin approval.`},
    confirmed:{heading:"Rental request approved",message:booking.payment_method==="gcash"?"Your request was approved. GCash payment instructions will be sent separately by Admin.":"Your request was approved. Please keep this reference for future updates."},
    rejected:{heading:"Rental request not approved",message:`We could not approve your rental request.${reason?` Reason: ${reason}`:" Please contact us if you need clarification."}`},
    ready:{heading:booking.fulfillment==="pickup"?"Rental ready for pickup":"Rental ready for fulfillment",message:booking.fulfillment==="pickup"?"Your rental items are ready for pickup. Please coordinate with Bloom & Borrow before arriving.":"Your rental items are ready for delivery or release. We will coordinate the fulfillment details with you."},
    rented:{heading:"Rental started",message:booking.fulfillment==="pickup"?"Your items have been released and the rental is now active.":"Your items have been delivered and the rental is now active."},
    returned:{heading:"Return recorded",message:`Your returned items were inspected.${Number(context.late_fee||0)>0?` Late fee: ${peso(context.late_fee)}.`:""}${Number(context.damage_charge||0)>0?` Damage charge: ${peso(context.damage_charge)}.`:""}`},
    completed:{heading:"Rental completed",message:`Your rental is complete.${Number(context.deposit_refund||0)>0?` A deposit refund of ${peso(context.deposit_refund)} was recorded.`:" Thank you for choosing Bloom & Borrow."}`},
    cancelled:{heading:"Rental cancelled",message:`Your rental booking was cancelled.${reason?` Reason: ${reason}`:""}`},
    overdue:{heading:"Rental return is overdue",message:`The scheduled return date was ${longDate(booking.end_date)}. Please contact Bloom & Borrow and arrange the return as soon as possible.`},
    rescheduled:{heading:"Rental dates updated",message:`Your rental was rescheduled from ${longDate(context.old_start_date)} – ${longDate(context.old_end_date)} to ${longDate(booking.start_date)} – ${longDate(booking.end_date)}.`}
  };
  return copies[event]||{heading:`Booking ${titleCase(booking.status)}`,message:`Your booking status is now ${titleCase(booking.status)}.`};
}

// Pure renderer exported for regression tests. All customer/admin-controlled
// values are escaped before entering HTML.
export function buildBookingLifecycleEmail({booking,event,context={},business={}}) {
  const copy=eventCopy(booking,event,context);
  const brand=business.business_name||"Bloom & Borrow";
  const subject=`${copy.heading} — ${booking.booking_no}`;
  const dates=`${longDate(booking.start_date)} – ${longDate(booking.end_date)}`;
  const contact=[business.business_phone,business.business_email].filter(Boolean).join(" · ");
  const text=`Hello ${booking.customer_name},\n\n${copy.message}\n\nBooking: ${booking.booking_no}\nRental dates: ${dates}\nCurrent status: ${titleCase(booking.status)}\nRental total: ${peso(Number(booking.grand_total||0))}\n\n${brand}${contact?`\n${contact}`:""}`;
  const safeMessage=escHtml(copy.message).replace(/\r?\n/g,"<br>");
  const html=`<!doctype html><html><body style="margin:0;background:#f4f8f7;font-family:Arial,sans-serif;color:#173d3e"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#fff;border:1px solid #dcebea;border-radius:14px;overflow:hidden"><tr><td style="padding:22px 26px;background:#089b9d;color:#fff"><strong style="font-size:20px">${escHtml(brand)}</strong></td></tr><tr><td style="padding:26px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#078487">${escHtml(booking.booking_no)}</div><h1 style="margin:7px 0 12px;font-size:24px;color:#173d3e">${escHtml(copy.heading)}</h1><p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#536c6d">Hello ${escHtml(booking.customer_name)},<br><br>${safeMessage}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4faf9;border-radius:10px"><tr><td style="padding:14px;font-size:13px;line-height:1.8"><strong>Rental dates:</strong> ${escHtml(dates)}<br><strong>Current status:</strong> ${escHtml(titleCase(booking.status))}<br><strong>Rental total:</strong> ${escHtml(peso(Number(booking.grand_total||0)))}</td></tr></table></td></tr><tr><td style="padding:16px 26px;border-top:1px solid #e4eeee;font-size:11px;line-height:1.6;color:#718687">${escHtml([business.business_address,contact].filter(Boolean).join(" · ")||brand)}</td></tr></table></td></tr></table></body></html>`;
  return {subject,text,html,heading:copy.heading};
}

async function recordDelivery({booking,event,heading,status}) {
  try {
    await addNotification({
      bookingId:booking.id,
      channel:"email",
      type:`BOOKING_${String(event).toUpperCase()}_EMAIL`,
      title:heading,
      message:status==="sent"?`Customer status email sent for ${booking.booking_no}.`:`Customer status email failed for ${booking.booking_no}.`,
      status
    });
  } catch(error) {
    console.error(`[BOOKING EMAIL LOG] ${booking.booking_no}:`,error.message);
  }
}

// Best-effort delivery: callers have already committed the booking change.
// The result is explicit so an Admin response can say sent, disabled, or failed
// without ever rolling back the business action or encouraging a duplicate.
export async function sendBookingLifecycleEmail({bookingId,event,context={}}) {
  try {
    const business=await getSettings(SETTINGS);
    const enabled=!["0","false","off","no"].includes(String(business.notification_email_enabled??"1").toLowerCase());
    if(!enabled)return {sent:false,skipped:true,reason:"Automatic customer emails are turned off in Settings."};
    const booking=await bookingDetailById(bookingId);
    if(!booking)return {sent:false,skipped:true,reason:"Booking no longer exists."};
    if(!booking.customer_email||booking.customer_email.endsWith("@invalid.local"))return {sent:false,skipped:true,reason:"This booking has no deliverable customer email address."};
    const content=buildBookingLifecycleEmail({booking,event,context,business});
    try {
      await sendMail({to:booking.customer_email,subject:content.subject,text:content.text,html:content.html});
      await recordDelivery({booking,event,heading:content.heading,status:"sent"});
      return {sent:true,skipped:false};
    } catch(error) {
      console.error(`[BOOKING EMAIL] ${booking.booking_no} (${event}):`,error.message);
      await recordDelivery({booking,event,heading:content.heading,status:"failed"});
      return {sent:false,skipped:false,error:"Customer email could not be sent. Check the SMTP configuration and retry manually."};
    }
  } catch(error) {
    console.error(`[BOOKING EMAIL] Booking ${bookingId} (${event}):`,error.message);
    return {sent:false,skipped:false,error:"Customer email could not be sent. Check the SMTP configuration and retry manually."};
  }
}

export function lifecycleEmailResponse(delivery,successMessage) {
  if(delivery.sent)return {email_sent:true,message:`${successMessage} Customer email sent.`};
  if(delivery.skipped)return {email_sent:false,email_skipped:true,email_warning:delivery.reason,message:`${successMessage} ${delivery.reason}`};
  return {email_sent:false,email_warning:delivery.error,message:`${successMessage} ${delivery.error}`};
}
