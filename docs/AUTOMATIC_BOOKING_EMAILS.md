# Automatic Booking Status Emails

Bloom & Borrow sends a branded customer email after each committed booking lifecycle change. A mail failure never rolls back or repeats the booking action.

## Email triggers

| Event | Trigger | Customer message |
| --- | --- | --- |
| Request submitted | Customer or Admin creates a booking | Reference number, dates, total, and pending-approval notice |
| Approved | `pending` to `confirmed` | Request approved; GCash customers are told that payment instructions follow separately |
| Rejected | `pending` to `rejected` | Required Admin reason and contact guidance |
| Ready | `confirmed` to `ready` | Pickup-ready or fulfillment-ready instructions |
| Rental started | `ready` to `rented` | Items released/delivered and rental active |
| Rescheduled | Admin changes rental dates | Exact old and new rental dates |
| Returned | Return inspection is recorded | Return confirmation plus applicable late/damage charges |
| Overdue | Hourly job changes `rented` to `overdue` | Due date and immediate return reminder |
| Cancelled | Booking changes to `cancelled` | Cancellation confirmation |
| Completed | Admin completes the rental | Completion and recorded deposit-refund amount |

Every lifecycle email contains the booking reference, rental dates, current status, total, and business branding. These informational emails do not include a status button.

The secure booking/payment button appears only in GCash emails when the customer needs to act: initial payment instructions, a rejected proof that needs replacement, or an approved partial payment with a remaining balance. Fully paid and ordinary lifecycle emails do not show the button.

The GCash email link carries an encrypted, tamper-resistant access token in the URL fragment, which is not sent to normal web-server access logs. It reveals no booking number or customer email, opens only the linked booking, is removed from the browser address bar after use, and expires after seven days by default. The booking-number-and-email form remains available when a link expires.

## Admin controls

- **Settings → Automatic customer status emails** enables or disables all lifecycle emails.
- A rejected rental requires a customer-facing reason before the action can continue.
- Booking details show the latest lifecycle email as `sent` or `failed` with its timestamp.
- **Email Current Status** manually resends the booking's current status after an SMTP failure or when the customer requests another copy.

## Delivery safety

1. The booking/status transaction finishes first.
2. Email is attempted only after the business action succeeds.
3. The `notifications` table records an email delivery row with `sent` or `failed` status.
4. The API returns precise wording: email sent, email disabled, or status saved but email failed.
5. Retrying an email never repeats the status transition, payment, refund, or return inspection.

## Configuration

Required SMTP variables:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your-business-account@gmail.com
SMTP_PASS=your-gmail-app-password
SMTP_FROM_NAME=Bloom & Borrow
CLIENT_ORIGIN=https://your-customer-site.example
BOOKING_LINK_SECRET=a-different-random-secret-with-at-least-64-characters
BOOKING_LINK_TTL_HOURS=168
```

For Gmail, `SMTP_PASS` must be an App Password generated after enabling 2-Step Verification. The lifecycle setting is enabled once by migration `013_booking_status_emails.sql`; later migration runs respect any change made by Admin in Settings.
