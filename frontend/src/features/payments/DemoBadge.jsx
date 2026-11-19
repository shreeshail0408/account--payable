import React from "react";
import { FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/** Marks payments recorded through the demo flow (DEMO- bank reference): no money moved. */
export function DemoBadge() {
  return (
    <Badge variant="warning" title="Recorded in demo mode; no money was transferred">
      <FlaskConical />
      Demo – no real transfer
    </Badge>
  );
}
