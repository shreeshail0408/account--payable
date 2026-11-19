/* Vendor page API calls. All endpoints existed before the migration except the additive
   `?vendor=` filter on vendor-onboardings/ and `?entity_type&entity_id` on audit-logs/. */
import api from "@/services/api";

export const listVendors = (params) => api.get("/vendors/", { params }).then(({ data }) => data);
export const getVendor = (id) => api.get(`/vendors/${id}/`).then(({ data }) => data);
export const createVendor = (body) => api.post("/vendors/", body).then(({ data }) => data);

export const approveOnboarding = (id) => api.post(`/vendors/${id}/approve_onboarding/`, {}).then(({ data }) => data);
export const rejectOnboarding = (id, comments) => (
  api.post(`/vendors/${id}/reject_onboarding/`, { comments }).then(({ data }) => data)
);
export const setVendorStatus = (id, status) => (
  api.post(`/vendors/${id}/set-status/`, { status }).then(({ data }) => data)
);
export const verifyGstin = (id) => api.post(`/vendors/${id}/verify-gstin/`).then(({ data }) => data);

/** Masked view (ADMIN only on the server). */
export const getBankDetails = (id) => api.get(`/vendors/${id}/bank-details/`).then(({ data }) => data);
export const saveBankDetails = (id, body) => api.post(`/vendors/${id}/bank-details/`, body).then(({ data }) => data);
/** Unmasked; ADMIN and ACCOUNTANT; every call is written to the audit log. */
export const getFullBankDetails = (id) => api.get(`/vendors/${id}/full-bank-details/`).then(({ data }) => data);
export const getBankHistory = (id) => api.get(`/vendors/${id}/bank-history/`).then(({ data }) => data);

export const listVendorOnboardings = (vendor) => (
  api.get("/vendor-onboardings/", { params: { vendor } }).then(({ data }) => data.results || data)
);
export const listVendorAudit = (vendor) => (
  api.get("/audit-logs/", { params: { entity_type: "Vendor", entity_id: vendor } }).then(({ data }) => data.results || data)
);
export const listVendorInvoices = (vendor) => (
  api.get("/invoices/", { params: { vendor, ordering: "-invoice_date" } }).then(({ data }) => data)
);
export const getIntegrationStatus = () => api.get("/integrations/status/").then(({ data }) => data);
