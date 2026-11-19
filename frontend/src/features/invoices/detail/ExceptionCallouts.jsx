import React from "react";
import { Calculator, Copy, FileWarning, Fingerprint, Package, ReceiptIndianRupee, Store, TriangleAlert } from "lucide-react";

/*
 * validate_and_match returns plain sentences. Group them under a readable heading by what they
 * are about, and pull the line name out of "Line 'Paper': ..." messages.
 */
const KINDS = [
  { test: /gstin/i, title: "GSTIN check", icon: Fingerprint },
  { test: /duplicate/i, title: "Possible duplicate", icon: Copy },
  { test: /line total/i, title: "Line amount differs", icon: Calculator },
  { test: /unit price/i, title: "Price differs from the PO", icon: ReceiptIndianRupee },
  { test: /quantity|received|goods/i, title: "Quantity doesn't match", icon: Package },
  { test: /description/i, title: "Description differs from the PO", icon: FileWarning },
  { test: /exceeds the purchase order/i, title: "Over the PO amount", icon: ReceiptIndianRupee },
  { test: /required|mandatory|at least one|must be linked/i, title: "Missing information", icon: FileWarning },
  { test: /vendor/i, title: "Vendor check", icon: Store },
  { test: /subtotal|tax|total|amount/i, title: "Amounts don't add up", icon: Calculator },
];

export function describeException(message) {
  const text = typeof message === "string" ? message : JSON.stringify(message);
  const lineMatch = text.match(/^Line '([^']+)':\s*(.*)$/);
  const body = lineMatch ? lineMatch[2] : text;
  const kind = KINDS.find((item) => item.test.test(text)) || { title: "Validation exception", icon: TriangleAlert };
  return {
    title: lineMatch ? `${kind.title} — ${lineMatch[1]}` : kind.title,
    body: body.charAt(0).toUpperCase() + body.slice(1),
    icon: kind.icon,
  };
}

export function ExceptionCallouts({ exceptions }) {
  return (
    <ul className="flex flex-col gap-2">
      {exceptions.map((message, index) => {
        const item = describeException(message);
        const Icon = item.icon;
        return (
          <li
            // Messages can repeat, so the index keeps keys unique.
            // eslint-disable-next-line react/no-array-index-key
            key={`${index}-${item.body}`}
            className="flex gap-3 rounded-md border border-danger-border bg-danger-subtle px-3 py-2"
          >
            <Icon className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-sm font-medium text-danger-subtle-foreground">{item.title}</p>
              <p className="text-sm text-danger-subtle-foreground">{item.body}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
