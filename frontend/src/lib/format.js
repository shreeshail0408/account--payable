/*
 * Display formatters. All amounts are INR with Indian digit grouping (₹1,23,456.00).
 * The API sends decimals as strings ("1234.50"); every helper accepts strings or numbers
 * and returns EMPTY for null, "" or unparseable input instead of "NaN".
 */

export const EMPTY = "—";

const LOCALE = "en-IN";
const formatters = new Map();

function getFormatter(key, factory) {
  if (!formatters.has(key)) {
    formatters.set(key, factory());
  }
  return formatters.get(key);
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

/** formatCurrency(123456) -> "₹1,23,456.00"; formatCurrency(-50.5) -> "-₹50.50". */
export function formatCurrency(value, { currency = "INR", fractionDigits = 2 } = {}) {
  const number = toNumber(value);
  if (number === null) {
    return EMPTY;
  }
  const formatter = getFormatter(`currency:${currency}:${fractionDigits}`, () => (
    new Intl.NumberFormat(LOCALE, {
      style: "currency",
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    })
  ));
  return formatter.format(number);
}

/** Short form for chart axes and tight spaces: 123456 -> "₹1.2L", 25000000 -> "₹2.5Cr". */
export function formatCurrencyCompact(value, { currency = "INR" } = {}) {
  const number = toNumber(value);
  if (number === null) {
    return EMPTY;
  }
  const formatter = getFormatter(`compact:${currency}`, () => (
    new Intl.NumberFormat(LOCALE, {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    })
  ));
  return formatter.format(number);
}

/** formatNumber(1234567.5) -> "12,34,567.5" (up to `fractionDigits` decimals). */
export function formatNumber(value, { fractionDigits = 3 } = {}) {
  const number = toNumber(value);
  if (number === null) {
    return EMPTY;
  }
  const formatter = getFormatter(`number:${fractionDigits}`, () => (
    new Intl.NumberFormat(LOCALE, { maximumFractionDigits: fractionDigits })
  ));
  return formatter.format(number);
}

/** formatPercent(95.456) -> "95.5%" (input is already a percentage, not a ratio). */
export function formatPercent(value, { fractionDigits = 1 } = {}) {
  const number = toNumber(value);
  if (number === null) {
    return EMPTY;
  }
  const formatter = getFormatter(`percent:${fractionDigits}`, () => (
    new Intl.NumberFormat(LOCALE, { maximumFractionDigits: fractionDigits })
  ));
  return `${formatter.format(number)}%`;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/*
 * Parse API dates. Date-only strings ("2026-11-19") are treated as local calendar dates;
 * `new Date("2026-11-19")` would be UTC midnight and can show the previous day west of UTC.
 */
function toDate(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const match = typeof value === "string" ? DATE_ONLY.exec(value) : null;
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** formatDate("2026-11-19") -> "19 Nov 2026". */
export function formatDate(value) {
  const date = toDate(value);
  if (!date) {
    return EMPTY;
  }
  const formatter = getFormatter("date", () => (
    new Intl.DateTimeFormat(LOCALE, { day: "2-digit", month: "short", year: "numeric" })
  ));
  return formatter.format(date);
}

/** formatDateTime("2026-11-19T10:15:00Z") -> "19 Nov 2026, 3:45 pm" (viewer's timezone). */
export function formatDateTime(value) {
  const date = toDate(value);
  if (!date) {
    return EMPTY;
  }
  const formatter = getFormatter("datetime", () => (
    new Intl.DateTimeFormat(LOCALE, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  ));
  return formatter.format(date);
}

/** Whole days from today until `value` (negative when in the past). */
export function daysFromToday(value) {
  const date = toDate(value);
  if (!date) {
    return null;
  }
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((target - start) / 86400000);
}
