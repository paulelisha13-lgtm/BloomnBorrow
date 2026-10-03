// Allocate one verified GCash transfer without changing the existing payment
// ledger model. Rental/service charges are settled first, followed by the
// refundable deposit. Integer cents avoid floating-point money drift.
const cents = value => Math.round(Number(value || 0) * 100);
const amount = value => Number((value / 100).toFixed(2));

export function allocateVerifiedGcashPayment({
  verifiedAmount,
  rentalDue,
  depositDue,
  rentalPaid,
  depositPaid
}) {
  const verified = cents(verifiedAmount);
  const rentalOutstanding = Math.max(0, cents(rentalDue) - cents(rentalPaid));
  const depositOutstanding = Math.max(0, cents(depositDue) - cents(depositPaid));
  const outstanding = rentalOutstanding + depositOutstanding;

  if (verified <= 0) throw new RangeError("Verified amount must be greater than zero.");
  if (verified > outstanding) {
    const error = new RangeError(`Verified amount exceeds the remaining balance of ${amount(outstanding)}.`);
    error.remainingBalance = amount(outstanding);
    throw error;
  }

  const rental = Math.min(verified, rentalOutstanding);
  const deposit = verified - rental;
  return {
    rental: amount(rental),
    deposit: amount(deposit),
    outstandingBefore: amount(outstanding),
    outstandingAfter: amount(outstanding - verified)
  };
}
