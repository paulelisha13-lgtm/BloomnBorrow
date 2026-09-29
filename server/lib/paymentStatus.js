// A booking's payment status follows what the customer paid in. A deposit
// refund at completion is expected and does not turn a fully paid booking back
// into "partial"; the booking only counts as refunded once refunds cancel out
// everything paid. Voided payments are excluded by the caller.
export function paymentStatusFor({ paid = 0, refunded = 0, total = 0 }) {
  paid = Number(paid || 0);
  refunded = Number(refunded || 0);
  total = Number(total || 0);
  let status = "unpaid";
  if (paid > 0 && paid < total) status = "partial";
  if (paid > 0 && paid >= total) status = "paid";
  if (paid > 0 && refunded >= paid) status = "refunded";
  return status;
}
