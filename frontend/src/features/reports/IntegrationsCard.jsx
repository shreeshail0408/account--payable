import React from "react";
import { CircleCheck, CircleDashed, Plug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { useRemoteData } from "@/hooks/useRemoteData";
import { formatDateTime } from "@/lib/format";
import { getIntegrationStatus, listIntegrationDeliveries } from "./api";

const LABELS = {
  erp: ["ERP", "Invoice sync to the accounting system"],
  bank: ["Bank", "Payment submission to the bank"],
  email: ["Email intake", "Invoices read from an IMAP mailbox"],
  gst: ["GST verification", "GSTIN lookups with a registry provider"],
};

/** Configuration status only: no provider credentials ship with PayFlow. */
export function IntegrationsCard({ role }) {
  const status = useRemoteData(getIntegrationStatus, "integrations", {
    fallback: "Integration status couldn't be loaded.",
  });
  return (
    <Card className="overflow-hidden p-0">
      <CardHeader className="pb-6">
        <CardTitle>Integrations</CardTitle>
        <CardDescription>
          “Not configured” means the server has no credentials, so that feature is off rather than simulated.
        </CardDescription>
      </CardHeader>
      <CardContent className="border-t border-border pt-6">
        <StatusList status={status} />
      </CardContent>
      {role === "ADMIN" && <Deliveries />}
    </Card>
  );
}

function StatusList({ status }) {
  if (status.error && !status.data) {
    return <ErrorState title="Couldn't load integration status" description={status.error} onRetry={status.reload} className="py-6" />;
  }
  if (!status.data) {
    return <LoadingState rows={2} className="p-0" />;
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Object.entries(status.data).map(([key, value]) => {
        const [title, description] = LABELS[key] || [key.toUpperCase(), ""];
        return (
          <li key={key} className="flex flex-col gap-2 rounded-lg border border-border p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{title}</span>
              {value.configured ? (
                <Badge variant="success">
                  <CircleCheck />
                  Configured
                </Badge>
              ) : (
                <Badge variant="neutral">
                  <CircleDashed />
                  Not configured
                </Badge>
              )}
            </div>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </li>
        );
      })}
    </ul>
  );
}

function Deliveries() {
  const deliveries = useRemoteData(listIntegrationDeliveries, "deliveries", {
    fallback: "Delivery attempts couldn't be loaded.",
  });
  let body;
  if (deliveries.error && !deliveries.data) {
    body = <ErrorState title="Couldn't load delivery attempts" description={deliveries.error} onRetry={deliveries.reload} />;
  } else if (!deliveries.data) {
    body = <LoadingState rows={3} />;
  } else if (!deliveries.data.length) {
    body = (
      <EmptyState
        icon={Plug}
        title="No delivery attempts yet"
        description="ERP syncs and bank submissions are logged here once an integration is configured and used."
      />
    );
  } else {
    body = (
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Provider</TableHead>
            <TableHead>Record</TableHead>
            <TableHead>Result</TableHead>
            <TableHead>Attempted</TableHead>
            <TableHead>Response</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deliveries.data.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.provider}</TableCell>
              <TableCell>
                {row.entity_type} #{row.entity_id}
              </TableCell>
              <TableCell>
                <StatusBadge kind="delivery" status={row.status} />
              </TableCell>
              <TableCell>{formatDateTime(row.attempted_at)}</TableCell>
              <TableCell className="max-w-72 truncate text-muted-foreground" title={row.response_summary}>
                {row.response_summary || row.response_status || "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }
  return (
    <div className="border-t border-border">
      <h4 className="px-6 pt-4 text-sm font-semibold">Delivery log</h4>
      {body}
    </div>
  );
}
