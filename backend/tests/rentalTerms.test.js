import test from "node:test";
import assert from "node:assert/strict";
import { buildRentalTerms, rentalTermsPlainText } from "../lib/rentalTerms.js";

test("rental terms require one ID and never promise a reservation percentage", () => {
  const terms=buildRentalTerms({business_name:"Bloom & Borrow"});
  const text=rentalTermsPlainText(terms);
  assert.match(text,/One clear and valid identification document/i);
  assert.match(text,/remains pending/i);
  assert.doesNotMatch(text,/10%|reservation deposit/i);
});

test("rental terms use configured delivery coverage and policy", () => {
  const terms=buildRentalTerms({
    free_delivery_area:"Biclatan test zone",
    delivery_policy:"A custom distance quote is required.",
    rental_terms_version:"2026.10"
  });
  const text=rentalTermsPlainText(terms);
  assert.equal(terms.version,"2026.10");
  assert.equal(terms.delivery.free_area,"Biclatan test zone");
  assert.match(text,/custom distance quote/i);
});
