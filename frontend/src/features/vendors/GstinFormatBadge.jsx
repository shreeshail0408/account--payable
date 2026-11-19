import React from "react";
import { CircleCheck, CircleX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { gstinFormatValid } from "./model";

/**
 * Local format check only. Worded "format valid" so it is never mistaken for a registry
 * verification (that is the separate verification status from the GST provider).
 */
export function GstinFormatBadge({ gstin, compact = false }) {
  const valid = gstinFormatValid(gstin);
  return (
    <Badge variant={valid ? "success" : "danger"} title="Checked locally against the GSTIN pattern">
      {valid ? <CircleCheck /> : <CircleX />}
      {valid ? "Format valid" : "Format invalid"}
      {!compact && <span className="sr-only"> (pattern check, not a registry lookup)</span>}
    </Badge>
  );
}
