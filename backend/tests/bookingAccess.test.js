import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingStatusUrl, createBookingAccessToken, verifyBookingAccessToken } from "../lib/bookingAccess.js";

process.env.BOOKING_LINK_SECRET ||= "test-only-booking-link-secret-that-is-long-enough-for-local-tests";

test("encrypted booking links round-trip and reject tampering", () => {
  const now=Date.UTC(2026,9,3);
  const token=createBookingAccessToken(32,now);
  assert.equal(token.split(".").length,3);
  assert.equal(verifyBookingAccessToken(token,now)?.bookingId,32);
  const changed=`${token.slice(0,-1)}${token.endsWith("a")?"b":"a"}`;
  assert.equal(verifyBookingAccessToken(changed,now),null);
});

test("secure booking links expire and contain no customer details", () => {
  const now=Date.UTC(2026,9,3);
  process.env.BOOKING_LINK_TTL_HOURS="1";
  process.env.CLIENT_ORIGIN="http://localhost:5173";
  const token=createBookingAccessToken(7,now);
  assert.equal(verifyBookingAccessToken(token,now+60*60*1000+1),null);
  const url=bookingStatusUrl(7);
  assert.match(url,/^http:\/\/localhost:5173\/shop\/status#access=/);
  assert.doesNotMatch(url,/booking|email|customer/i);
  delete process.env.BOOKING_LINK_TTL_HOURS;
});
