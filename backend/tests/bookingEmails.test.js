import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBookingLifecycleEmail, lifecycleEmailResponse } from "../lib/bookingEmails.js";

const booking={
  id:1,booking_no:"RF-000001",customer_name:"Juan <script>alert(1)</script>",
  status:"rejected",payment_method:"gcash",fulfillment:"pickup",
  start_date:"2026-11-10",end_date:"2026-11-12",grand_total:4500
};

test("booking lifecycle email renders branded, escaped customer content", () => {
  const email=buildBookingLifecycleEmail({
    booking,event:"rejected",context:{note:"ID <b>cannot</b> be verified"},
    business:{business_name:"Bloom & Borrow",business_email:"hello@example.com"}
  });
  assert.match(email.subject,/Rental request not approved/);
  assert.match(email.text,/ID <b>cannot<\/b> be verified/);
  assert.doesNotMatch(email.html,/<script>/);
  assert.doesNotMatch(email.html,/<b>cannot<\/b>/);
  assert.match(email.html,/ID &lt;b&gt;cannot&lt;\/b&gt; be verified/);
  assert.doesNotMatch(email.html,/Check Rental Status/);
});

test("email result wording distinguishes sent, disabled, and failed delivery", () => {
  assert.deepEqual(lifecycleEmailResponse({sent:true},"Booking approved."),{email_sent:true,message:"Booking approved. Customer email sent."});
  assert.equal(lifecycleEmailResponse({sent:false,skipped:true,reason:"Emails are off."},"Booking approved.").email_skipped,true);
  assert.match(lifecycleEmailResponse({sent:false,skipped:false,error:"SMTP failed."},"Booking approved.").message,/SMTP failed/);
});
