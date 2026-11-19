/*
 * Invoice workspace API calls. Every endpoint here already existed before the rebuild except the
 * additive read-only ones marked "new" (see docs/api.md).
 */
import api from "@/services/api";

const MULTIPART = { headers: { "Content-Type": "multipart/form-data" } };

/** Re-exported so existing imports keep working; the helper lives in lib/pagination. */
export { fetchAllPages } from "@/lib/pagination";

export function listInvoices(params) {
  return api.get("/invoices/", { params }).then(({ data }) => data);
}

export function getInvoice(id) {
  return api.get(`/invoices/${id}/`).then(({ data }) => data);
}

/** New: per-line PO/GRN comparison, approval steps, payment and audit events. */
export function getInvoiceActivity(id) {
  return api.get(`/invoices/${id}/activity/`).then(({ data }) => data);
}

/** New: the PO matching tolerances the server applies. */
export function getMatchSettings() {
  return api.get("/invoices/match-settings/").then(({ data }) => data);
}

export function previewOcr(file) {
  const body = new FormData();
  body.append("file", file);
  return api.post("/invoices/ocr-preview/", body).then(({ data }) => data);
}

/** POST /invoices/ (multipart): form fields, `line_items` JSON string, the file. */
export function createInvoice({ fields, lines, file, reviewed }) {
  const body = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== "" && value !== null && value !== undefined) {
      body.append(key, value);
    }
  });
  body.append("line_items", JSON.stringify(lines));
  if (reviewed) {
    body.append("reviewed_extraction", "true");
  }
  body.append("file", file);
  return api.post("/invoices/", body, MULTIPART).then(({ data }) => data);
}

export function updateInvoice(id, fields, lines) {
  return api.patch(`/invoices/${id}/`, { ...fields, line_items: lines }).then(({ data }) => data);
}

export function confirmExtractionReview(id) {
  return api.post(`/invoices/${id}/review-extraction/`, { confirmed: true }).then(({ data }) => data);
}

/** POST /invoices/bulk/ with one or more files for one vendor -> {created, invoice_ids, errors}. */
export function bulkUpload({ vendor, files, onUploadProgress }) {
  const body = new FormData();
  body.append("vendor", vendor);
  files.forEach((file) => body.append("files", file));
  return api.post("/invoices/bulk/", body, { ...MULTIPART, onUploadProgress }).then(({ data }) => data);
}

export function submitForApproval(id) {
  return api.post(`/invoices/${id}/submit_approval/`).then(({ data }) => data);
}

export function syncToErp(id) {
  return api.post(`/invoices/${id}/sync-erp/`).then(({ data }) => data);
}

export function getIntegrationStatus() {
  return api.get("/integrations/status/").then(({ data }) => data);
}
