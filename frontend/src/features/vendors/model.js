/*
 * Vendor rules shared by the page, the drawer and the forms. Role lists mirror
 * backend/ap_app/permissions.py and the per-action checks in VendorViewSet.
 */
export const canCreateVendor = (role) => ["ADMIN", "AP_CLERK"].includes(role);
export const canDecideOnboarding = (role) => role === "ADMIN";
export const canSetVendorStatus = (role) => role === "ADMIN";
export const canManageBank = (role) => role === "ADMIN";
export const canRevealBank = (role) => ["ADMIN", "ACCOUNTANT"].includes(role);
export const canVerifyGstin = (role) => ["ADMIN", "ACCOUNTANT"].includes(role);
export const canReadOnboardings = (role) => ["ADMIN", "AP_CLERK", "AUDITOR"].includes(role);
export const canReadAudit = (role) => ["ADMIN", "AUDITOR"].includes(role);

// Same patterns as VendorSerializer / VendorBankDetailsSerializer.
export const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/;
export const PAN_PATTERN = /^[A-Z]{5}\d{4}[A-Z]$/;
export const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const ACCOUNT_PATTERN = /^[A-Za-z0-9 -]{8,34}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Format check only (state code, PAN, entity, "Z", checksum position); not a registry lookup. */
export function gstinFormatValid(value) {
  return GSTIN_PATTERN.test(String(value || "").toUpperCase());
}

export const emptyVendorForm = () => ({
  code: "",
  name: "",
  email: "",
  phone: "",
  gstin: "",
  pan: "",
  address: "",
});

export function validateVendorForm(form) {
  const errors = {};
  if (!form.code.trim()) {
    errors.code = "Enter a vendor code.";
  }
  if (!form.name.trim()) {
    errors.name = "Enter the vendor's legal name.";
  }
  if (!EMAIL_PATTERN.test(form.email.trim())) {
    errors.email = "Enter a valid email address.";
  }
  if (form.gstin && !gstinFormatValid(form.gstin)) {
    errors.gstin = "Use the 15-character GSTIN format, e.g. 29ABCDE1234F1Z5.";
  }
  if (form.pan && !PAN_PATTERN.test(form.pan)) {
    errors.pan = "Use the 10-character PAN format, e.g. ABCDE1234F.";
  }
  return errors;
}

export const emptyBankForm = (vendor) => ({
  bank_name: vendor?.bank_name || "",
  bank_account: "",
  ifsc: "",
});

export function validateBankForm(form) {
  const errors = {};
  if (!form.bank_name.trim()) {
    errors.bank_name = "Enter the bank name.";
  }
  if (!ACCOUNT_PATTERN.test(form.bank_account)) {
    errors.bank_account = "Enter the full account number (8–34 letters, digits, spaces or dashes).";
  }
  if (!IFSC_PATTERN.test(form.ifsc)) {
    errors.ifsc = "Use the 11-character IFSC format, e.g. HDFC0001234.";
  }
  return errors;
}

const AUDIT_LABELS = {
  "vendor.created": "Vendor record created",
  "vendor.status_changed": "Vendor status changed",
  "vendor.bank_details_changed": "Bank details changed",
  "vendor.bank_details_viewed": "Full bank details viewed",
  "vendor.updated": "Vendor details updated",
};

// The onboarding record already supplies these, so the audit copies are skipped.
const DUPLICATE_AUDIT = new Set(["vendor.onboarding_approved", "vendor.onboarding_rejected"]);

/** Timeline items from the onboarding record and (for admins/auditors) the vendor's audit trail. */
export function vendorTimeline(onboarding, auditEvents) {
  const items = [];
  if (onboarding) {
    items.push({
      key: "submitted",
      kind: "submitted",
      title: "Submitted for onboarding",
      time: onboarding.submitted_at,
      actor: onboarding.submitted_by_name,
    });
    if (onboarding.status === "APPROVED" || onboarding.status === "REJECTED") {
      items.push({
        key: "decided",
        kind: onboarding.status === "APPROVED" ? "approved" : "rejected",
        title: onboarding.status === "APPROVED" ? "Approved and activated" : "Rejected",
        time: onboarding.decided_at,
        actor: onboarding.decided_by_name,
        description: onboarding.comments ? `“${onboarding.comments}”` : null,
      });
    }
  }
  (auditEvents || [])
    .filter((event) => !DUPLICATE_AUDIT.has(event.action))
    .filter((event) => !(onboarding && event.action === "vendor.created"))
    .forEach((event) => {
      const details = event.details || {};
      let description = null;
      if (event.action === "vendor.status_changed" && details.from) {
        description = `${details.from} → ${details.to}`;
      } else if (details.account_last4) {
        description = `Account ending ${details.account_last4}`;
      }
      items.push({
        key: `audit-${event.id}`,
        kind: event.action === "vendor.status_changed" ? "status" : "audit",
        title: AUDIT_LABELS[event.action] || event.action,
        time: event.timestamp,
        actor: event.actor_name,
        description,
      });
    });
  items.sort((a, b) => new Date(a.time || 0) - new Date(b.time || 0));
  if (onboarding?.status === "SUBMITTED") {
    items.push({ key: "pending", kind: "pending", title: "Awaiting administrator review" });
  }
  return items;
}
