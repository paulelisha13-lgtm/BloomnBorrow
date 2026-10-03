# GCash Payment-Proof Review

## Customer and Admin flow

1. Admin approves the rental request and emails the private GCash QR code and instructions.
2. The customer opens **Check Status** and uploads a JPG, PNG, or WebP payment screenshot.
3. **Payment Proof to Review** is prioritised in the Admin notification menu.
4. Admin opens the booking, views the private screenshot, and chooses **Approve Proof** or **Reject Proof**.
5. Approval requires the verified amount and GCash reference number. Rejection requires a clear customer-facing reason.
6. The customer sees the result in **Check Status** and receives the same decision by email when SMTP is available.

## Proof states

- `awaiting`: instructions were sent and no screenshot is waiting for review.
- `submitted`: a screenshot is locked in the review queue; duplicate uploads are blocked.
- `approved`: the verified payment was recorded in the payment ledger.
- `rejected`: no payment was recorded; the customer can upload a replacement screenshot.

If Admin approves only part of the remaining balance, the customer can make another payment and upload another proof. The previous approved amount remains in the payment ledger even though the single current-proof slot is replaced.

## Accounting and conflict protection

- Approval runs inside a database transaction and locks the booking/payment-workflow row.
- Repeated or concurrent approval requests cannot create duplicate payments.
- Verified money is applied to outstanding rental/service charges first, then the refundable deposit, matching the existing invoice breakdown.
- An amount above the remaining balance is rejected with an exact error message.
- Rejected proofs never create payment rows.
- Payment corrections continue to use the existing void flow; payment rows are never deleted.

## Email behaviour

The review is committed before the customer email is attempted. If SMTP is unavailable, Admin receives a precise warning that the review and payment were saved but the email failed. This prevents a temporary mail problem from duplicating or losing a financial decision.

## Deployment

Run the migration before starting the updated application:

```bash
cd backend
npm run migrate
```

Migration `012_gcash_payment_proof_review.sql` is safe to re-run and converts the unused legacy `reviewed` state back to `submitted` so it must receive an explicit approval before any payment is recorded.
