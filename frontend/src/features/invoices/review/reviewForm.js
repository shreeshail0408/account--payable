/* Building and diffing the review form state (no React). */
import { newKey } from "../model";

const FIELD_KEYS = ["invoice_number", "invoice_date", "due_date", "subtotal", "tax_amount", "total_amount"];

function text(value) {
  return value === null || value === undefined ? "" : String(value);
}

function toLine(line) {
  return {
    key: newKey(),
    description: text(line.description),
    quantity: text(line.quantity || "1"),
    unit_price: text(line.unit_price),
    tax_rate: text(line.tax_rate || "0"),
    po_line: line.po_line ? String(line.po_line) : "",
  };
}

function vendorForGstin(gstin, vendors) {
  if (!gstin) {
    return null;
  }
  return vendors.find((vendor) => (vendor.gstin || "").toUpperCase() === gstin.toUpperCase()) || null;
}

/** New capture: start from the OCR suggestions; the vendor is matched by GSTIN when possible. */
export function formFromOcr(suggestions, vendors) {
  const fields = suggestions || {};
  const gstin = text(fields.gstin).toUpperCase();
  const vendor = vendorForGstin(gstin, vendors);
  return {
    fields: {
      invoice_number: text(fields.invoice_number),
      vendor: vendor ? String(vendor.id) : "",
      purchase_order: "",
      invoice_date: text(fields.invoice_date),
      due_date: text(fields.due_date),
      extracted_gstin: gstin,
      subtotal: text(fields.subtotal),
      tax_amount: fields.tax_amount === null || fields.tax_amount === undefined ? "0" : text(fields.tax_amount),
      total_amount: text(fields.total_amount),
      match_type: "NONE",
    },
    lines: (Array.isArray(fields.line_items) ? fields.line_items : []).map(toLine),
    vendorMatchedByGstin: Boolean(vendor),
  };
}

/** Existing invoice (bulk / email capture): start from what is saved. */
export function formFromInvoice(invoice) {
  return {
    fields: {
      invoice_number: text(invoice.invoice_number),
      vendor: text(invoice.vendor),
      purchase_order: invoice.purchase_order ? String(invoice.purchase_order) : "",
      invoice_date: text(invoice.invoice_date),
      due_date: text(invoice.due_date),
      extracted_gstin: text(invoice.extracted_gstin).toUpperCase(),
      subtotal: text(invoice.subtotal),
      tax_amount: text(invoice.tax_amount || "0"),
      total_amount: text(invoice.total_amount),
      match_type: invoice.match_type || "NONE",
    },
    lines: (invoice.lines || []).map(toLine),
    vendorMatchedByGstin: false,
  };
}

function sameValue(key, value, suggested) {
  if (suggested === null || suggested === undefined || suggested === "") {
    return value === "";
  }
  if (["subtotal", "tax_amount", "total_amount"].includes(key)) {
    return Number(value) === Number(suggested);
  }
  return String(value).trim().toUpperCase() === String(suggested).trim().toUpperCase();
}

/** Which fields differ from the OCR suggestion (so their confidence shows "Edited"). */
export function editedFields(fields, suggestions) {
  if (!suggestions) {
    return {};
  }
  const edited = {};
  FIELD_KEYS.forEach((key) => {
    edited[key] = !sameValue(key, fields[key], suggestions[key]);
  });
  edited.extracted_gstin = !sameValue("gstin", fields.extracted_gstin, suggestions.gstin);
  return edited;
}

/** Payload fields for POST /invoices/ (as before the rebuild). */
export function createPayload(fields) {
  return {
    invoice_number: fields.invoice_number.trim(),
    vendor: fields.vendor,
    purchase_order: fields.purchase_order,
    invoice_date: fields.invoice_date,
    due_date: fields.due_date,
    extracted_gstin: fields.extracted_gstin,
    subtotal: fields.subtotal,
    tax_amount: fields.tax_amount,
    total_amount: fields.total_amount,
    match_type: fields.match_type,
  };
}

/** Payload fields for PATCH /invoices/{id}/ (the old review modal's fields; vendor is fixed). */
export function updatePayload(fields) {
  return {
    invoice_number: fields.invoice_number.trim(),
    invoice_date: fields.invoice_date,
    due_date: fields.due_date,
    extracted_gstin: fields.extracted_gstin,
    subtotal: fields.subtotal,
    tax_amount: fields.tax_amount,
    total_amount: fields.total_amount,
    match_type: fields.match_type,
    purchase_order: fields.purchase_order || null,
  };
}
