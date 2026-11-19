/* Payment API calls (unchanged endpoints). */
import api from "@/services/api";
import { fetchAllPages } from "@/lib/pagination";

export const listAllPayments = () => fetchAllPages("/payments/");
export const listApprovedInvoices = () => fetchAllPages("/invoices/", { status: "APPROVED" }).then(({ rows }) => rows);
export const generatePayment = (invoice, paymentMethod) => (
  api.post("/payments/generate/", { invoice, payment_method: paymentMethod }).then(({ data }) => data)
);
export const markPaid = (id, bankReference) => (
  api.post(`/payments/${id}/mark_paid/`, { bank_reference: bankReference }).then(({ data }) => data)
);
export const markFailed = (id, reason) => api.post(`/payments/${id}/mark-failed/`, { reason }).then(({ data }) => data);
export const submitToBank = (id) => api.post(`/payments/${id}/submit-bank/`).then(({ data }) => data);
export const getIntegrationStatus = () => api.get("/integrations/status/").then(({ data }) => data);
