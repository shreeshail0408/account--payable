/*
 * Money arithmetic in integer paise, so running totals never show float noise
 * (0.1 + 0.2). Display with formatCurrency(fromPaise(value)).
 */

/** Parse a form value into integer paise; null when blank or not a number. */
export function toPaise(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) : null;
}

export function fromPaise(paise) {
  return paise / 100;
}

/** quantity x unit_price in paise (0 when either is missing). */
export function lineAmountPaise(line) {
  const quantity = Number(line.quantity);
  const price = Number(line.unit_price);
  if (!Number.isFinite(quantity) || !Number.isFinite(price)) {
    return 0;
  }
  return Math.round(quantity * price * 100);
}

/** Quantities have 3 decimals on the server; compare them as integer thousandths. */
export function toMilli(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 1000) : 0;
}
