/*
 * Purchase order / goods receipt rules. Roles mirror permissions.py: ADMIN and AP_CLERK create
 * POs and GRNs; AUDITOR reads both. Server rules mirrored here for instant feedback:
 * POSerializer (total > 0, quantity > 0, price >= 0, lines total <= PO total) and
 * GRNSerializer (open PO, at least one line, never above the ordered quantity).
 */
import { fromPaise, lineAmountPaise, toMilli, toPaise } from "@/lib/money";

export const canManagePurchaseOrders = (role) => ["ADMIN", "AP_CLERK"].includes(role);
export const canRecordReceipts = (role) => ["ADMIN", "AP_CLERK"].includes(role);

export const PO_STATUSES = ["OPEN", "CLOSED", "CANCELLED"];

let keyCounter = 0;
export function newKey(prefix = "row") {
  keyCounter += 1;
  return `${prefix}-${keyCounter}`;
}

export function todayIso() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

/* ---------- Purchase orders ---------- */

export const emptyPoLine = () => ({ key: newKey("po-line"), description: "", quantity: "1", unit_price: "" });

export const emptyPoForm = () => ({
  number: "",
  vendor: "",
  order_date: todayIso(),
  expected_date: "",
  status: "OPEN",
  total_amount: "",
  lines: [emptyPoLine()],
});

export function poLinesTotalPaise(lines) {
  return lines.reduce((sum, line) => sum + lineAmountPaise(line), 0);
}

function isBlankLine(line) {
  return !line.description.trim() && !line.unit_price && (!line.quantity || line.quantity === "1");
}

/** Lines that will be sent: a fully blank trailing row is ignored rather than rejected. */
export function poLinesToSend(lines) {
  return lines.filter((line) => !isBlankLine(line));
}

/** Returns { errors: {field}, lineErrors: [{field}] }; empty objects when valid. */
export function validatePoForm(form, effectiveTotal) {
  const errors = {};
  if (!form.number.trim()) {
    errors.number = "Enter a PO number.";
  }
  if (!form.vendor) {
    errors.vendor = "Choose a vendor.";
  }
  if (!form.order_date) {
    errors.order_date = "Enter the order date.";
  }
  if (form.expected_date && form.order_date && form.expected_date < form.order_date) {
    errors.expected_date = "Expected delivery can't be before the order date.";
  }
  const total = toPaise(effectiveTotal);
  if (total === null || total <= 0) {
    errors.total_amount = "The PO total must be greater than zero.";
  }
  const lines = poLinesToSend(form.lines);
  const lineErrors = form.lines.map((line) => {
    if (isBlankLine(line)) {
      return {};
    }
    const lineError = {};
    if (!line.description.trim()) {
      lineError.description = "Describe the item.";
    }
    if (!(Number(line.quantity) > 0)) {
      lineError.quantity = "More than 0.";
    }
    if (line.unit_price === "" || !(Number(line.unit_price) >= 0)) {
      lineError.unit_price = "0 or more.";
    }
    return lineError;
  });
  const linesTotal = poLinesTotalPaise(lines);
  if (total !== null && total > 0 && linesTotal > total) {
    errors.total_amount = "The lines add up to more than the PO total.";
  }
  return { errors, lineErrors };
}

export function hasErrors({ errors, lineErrors }) {
  return Object.keys(errors).length > 0 || lineErrors.some((line) => Object.keys(line).length > 0);
}

export function poPayload(form, effectiveTotal) {
  const payload = {
    number: form.number.trim(),
    vendor: form.vendor,
    order_date: form.order_date,
    status: form.status,
    total_amount: fromPaise(toPaise(effectiveTotal)).toFixed(2),
  };
  if (form.expected_date) {
    payload.expected_date = form.expected_date;
  }
  const lines = poLinesToSend(form.lines);
  if (lines.length) {
    payload.lines = lines.map((line) => ({
      description: line.description.trim(),
      quantity: line.quantity,
      unit_price: line.unit_price,
    }));
  }
  return payload;
}

/** Received vs ordered across all lines of a PO (quantities; units may differ per line). */
export function poProgress(po) {
  const lines = po?.lines || [];
  return lines.reduce(
    (totals, line) => ({
      ordered: totals.ordered + Number(line.quantity || 0),
      received: totals.received + Number(line.received_quantity || 0),
    }),
    { ordered: 0, received: 0 },
  );
}

export function remainingQuantity(line) {
  return Math.max(0, (toMilli(line.quantity) - toMilli(line.received_quantity)) / 1000);
}

/* ---------- Goods receipts ---------- */

export const emptyGrnForm = (purchaseOrder = "") => ({
  number: "",
  purchase_order: purchaseOrder ? String(purchaseOrder) : "",
  received_date: todayIso(),
  notes: "",
  lines: [],
});

/** One row per PO line that still has quantity to receive. */
export function grnRowsForPo(po) {
  return (po?.lines || [])
    .filter((line) => remainingQuantity(line) > 0)
    .map((line) => ({ key: newKey("grn-line"), po_line: String(line.id), quantity: "" }));
}

export function receivablePurchaseOrders(orders) {
  return orders.filter((po) => po.status === "OPEN" && (po.lines || []).some((line) => remainingQuantity(line) > 0));
}

export function validateGrnForm(form, po) {
  const errors = {};
  if (!form.number.trim()) {
    errors.number = "Enter the GRN number.";
  }
  if (!form.purchase_order) {
    errors.purchase_order = "Choose the purchase order.";
  }
  if (!form.received_date) {
    errors.received_date = "Enter the date the goods arrived.";
  }
  const linesById = new Map((po?.lines || []).map((line) => [String(line.id), line]));
  const totalsByLine = new Map();
  form.lines.forEach((row) => {
    totalsByLine.set(row.po_line, (totalsByLine.get(row.po_line) || 0) + toMilli(row.quantity));
  });
  const lineErrors = form.lines.map((row) => {
    const lineError = {};
    const poLine = linesById.get(row.po_line);
    if (!poLine) {
      lineError.po_line = "Choose a PO line.";
      return lineError;
    }
    if (!(Number(row.quantity) > 0)) {
      lineError.quantity = "Enter more than 0, or remove the row.";
    } else if (totalsByLine.get(row.po_line) > toMilli(remainingQuantity(poLine))) {
      lineError.quantity = `Only ${remainingQuantity(poLine)} left to receive.`;
    }
    return lineError;
  });
  if (form.purchase_order && form.lines.length === 0) {
    errors.lines = "Add at least one received line.";
  }
  return { errors, lineErrors };
}

/** Running totals for the receipt being entered. */
export function grnTotals(form, po) {
  const linesById = new Map((po?.lines || []).map((line) => [String(line.id), line]));
  return form.lines.reduce(
    (totals, row) => {
      const poLine = linesById.get(row.po_line);
      const quantity = Number(row.quantity) || 0;
      return {
        quantity: totals.quantity + quantity,
        valuePaise: totals.valuePaise + (poLine ? lineAmountPaise({ quantity, unit_price: poLine.unit_price }) : 0),
      };
    },
    { quantity: 0, valuePaise: 0 },
  );
}

export function grnPayload(form, userId) {
  return {
    number: form.number.trim(),
    purchase_order: form.purchase_order,
    received_date: form.received_date,
    received_by: userId,
    notes: form.notes,
    lines: form.lines.map((row) => ({ po_line: row.po_line, quantity: row.quantity })),
  };
}
