import { peso } from "./format.js";

export const RENTAL_TERMS_SETTING_KEYS = [
  "business_name",
  "business_email",
  "business_phone",
  "business_address",
  "late_fee_per_day",
  "cancellation_policy",
  "free_delivery_area",
  "delivery_policy",
  "rental_care_policy",
  "loss_damage_policy",
  "inspection_policy",
  "rental_terms_version"
];

export const RENTAL_POLICY_EDITABLE_KEYS = [
  "free_delivery_area",
  "delivery_policy",
  "rental_care_policy",
  "loss_damage_policy",
  "inspection_policy",
  "cancellation_policy",
  "late_fee_per_day"
];

const DEFAULTS = {
  free_delivery_area: "Biclatan, General Trias, Cavite and nearby areas confirmed by Bloom & Borrow",
  delivery_policy: "Addresses outside the free-delivery area are reviewed individually. Any delivery fee is based on distance and trip requirements and will be confirmed before the rental request is approved.",
  rental_care_policy: "The renter is responsible for the proper use, handling, and safekeeping of every rented item from receipt until return.",
  loss_damage_policy: "Lost, stolen, missing, or irreparably damaged items may be charged at replacement cost. Repairable damage may be charged based on the documented repair cost.",
  inspection_policy: "Rental items are checked before release and again upon return. Any issue found during return inspection will be documented and reviewed before the security deposit is settled.",
  cancellation_policy: "Cancellation and refund eligibility depend on the booking status, payments already made, and the business cancellation policy confirmed for the booking.",
  rental_terms_version: "1.0"
};

const value = (settings, key) => String(settings?.[key] || DEFAULTS[key] || "").trim();

export function buildRentalTerms(settings = {}) {
  const businessName = value(settings, "business_name") || "Bloom & Borrow";
  const freeArea = value(settings, "free_delivery_area");
  const lateFee = Number(settings.late_fee_per_day || 0);
  const version = value(settings, "rental_terms_version");

  return {
    title: "Rental Terms & Conditions",
    version,
    business_name: businessName,
    delivery: {
      free_area: freeArea,
      review_required: true
    },
    sections: [
      {
        id: "customer-information",
        title: "Accurate customer information",
        paragraphs: [
          "Provide your correct full name, an active email address, a reachable phone number, and a complete current address. These details are used to review and communicate about your rental request."
        ],
        bullets: [
          "Incorrect, incomplete, or unreachable contact details may delay or prevent approval.",
          "You are responsible for keeping your contact and delivery information accurate."
        ]
      },
      {
        id: "identity",
        title: "Identity verification",
        paragraphs: [
          `One clear and valid identification document is required so ${businessName} can verify the renter's identity.`
        ],
        bullets: [
          "The ID must be readable and must match the information in the rental request.",
          "Uploaded identification is handled according to the Privacy Policy and is not displayed publicly."
        ]
      },
      {
        id: "approval-payment",
        title: "Booking approval and payment",
        paragraphs: [
          "Submitting a rental request does not immediately confirm the booking. The request remains pending while availability, customer information, delivery requirements, and the final amount are reviewed. The system may temporarily hold the requested inventory during this review, but final approval is still required.",
          "Payment instructions and any applicable deadline will be provided after the request has been reviewed."
        ]
      },
      {
        id: "rental-period",
        title: "Rental period and returns",
        paragraphs: [
          "The approved start and end dates define the rental period. Items must be returned on the agreed date and in the condition in which they were released, subject to normal use."
        ],
        bullets: lateFee > 0
          ? [`Late returns may be charged ${peso(lateFee)} per day unless another written arrangement is approved.`]
          : ["Late returns may incur an additional charge based on the policy confirmed for the booking."]
      },
      {
        id: "delivery",
        title: "Delivery and pickup",
        paragraphs: [
          `Delivery within ${freeArea} may be free after the address is verified by ${businessName}.`,
          value(settings, "delivery_policy")
        ],
        bullets: [
          "The customer must provide a complete address and be available to receive or return the items at the agreed time.",
          "Pickup remains available when selected and confirmed for the booking."
        ]
      },
      {
        id: "care",
        title: "Care of rental items",
        paragraphs: [value(settings, "rental_care_policy")]
      },
      {
        id: "loss-damage",
        title: "Loss, damage, and missing items",
        paragraphs: [value(settings, "loss_damage_policy")]
      },
      {
        id: "cancellation",
        title: "Cancellation and refunds",
        paragraphs: [value(settings, "cancellation_policy")]
      },
      {
        id: "inspection",
        title: "Item inspection",
        paragraphs: [value(settings, "inspection_policy")]
      }
    ],
    contact: {
      email: value(settings, "business_email"),
      phone: value(settings, "business_phone"),
      address: value(settings, "business_address")
    }
  };
}

export function rentalTermsPlainText(terms) {
  return [
    `${terms.title} (Version ${terms.version})`,
    ...terms.sections.flatMap((section, index) => [
      `${index + 1}. ${section.title}`,
      ...(section.paragraphs || []),
      ...(section.bullets || []).map(item => `- ${item}`)
    ])
  ].join("\n");
}
