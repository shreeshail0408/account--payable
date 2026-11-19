import React, { useEffect, useState } from "react";
import { Eye, EyeOff, Landmark, Lock, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { InlineAlert } from "@/components/inline-alert";
import { DescriptionList, Section } from "@/components/page";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRemoteData } from "@/hooks/useRemoteData";
import { apiErrorMessage } from "@/lib/api-errors";
import { formatDateTime } from "@/lib/format";
import { getBankHistory, getFullBankDetails } from "../api";
import { BankDetailsDialog } from "../BankDetailsDialog";
import { canManageBank, canRevealBank } from "../model";

/**
 * Bank details are masked in every general response. ADMIN and ACCOUNTANT can reveal the full
 * values (each reveal is audited); only ADMIN can change them.
 */
export function BankTab({ vendor, role, onSaved }) {
  const [revealed, setRevealed] = useState(null);
  const [revealing, setRevealing] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // Hide revealed values again whenever the record changes.
  useEffect(() => {
    setRevealed(null);
  }, [vendor.id, vendor.updated_at]);

  const reveal = async () => {
    setRevealing(true);
    try {
      setRevealed(await getFullBankDetails(vendor.id));
    } catch (error) {
      toast.error(apiErrorMessage(error, { fallback: "Full bank details couldn't be loaded." }));
    } finally {
      setRevealing(false);
    }
  };

  const hasBank = Boolean(vendor.bank_account || vendor.bank_name);
  const shown = revealed || vendor;

  return (
    <div className="flex flex-col gap-8">
      <Section
        title="Payment account"
        description={revealed ? "Full values. Hide them when you're done." : "Masked: only the last four characters are shown."}
        aside={(
          <div className="flex flex-wrap gap-2">
            {hasBank && canRevealBank(role) && (
              revealed ? (
                <Button size="sm" variant="outline" onClick={() => setRevealed(null)}>
                  <EyeOff />
                  Hide
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={reveal} loading={revealing}>
                  {!revealing && <Eye />}
                  Show full details
                </Button>
              )
            )}
            {canManageBank(role) && (
              <Button size="sm" onClick={() => setEditOpen(true)}>
                <Pencil />
                {hasBank ? "Update" : "Add bank details"}
              </Button>
            )}
          </div>
        )}
      >
        {hasBank ? (
          <DescriptionList
            items={[
              { label: "Bank", value: shown.bank_name || "—" },
              { label: "Account number", value: <span className="font-mono">{shown.bank_account || "—"}</span> },
              { label: "IFSC", value: <span className="font-mono">{shown.ifsc || "—"}</span> },
              {
                label: "Verification",
                value: <StatusBadge kind="verification" status={vendor.bank_verification_status} />,
              },
            ]}
          />
        ) : (
          <EmptyState
            icon={Landmark}
            title="No bank details yet"
            description={canManageBank(role)
              ? "Add the vendor's account before generating payments."
              : "An administrator adds the vendor's bank account."}
            className="py-8"
          />
        )}
        {revealed && (
          <InlineAlert tone="warning">This view was recorded in the audit log.</InlineAlert>
        )}
        {hasBank && !canRevealBank(role) && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Lock className="size-3.5" aria-hidden="true" />
            Full bank details are visible to administrators and accountants.
          </p>
        )}
        {vendor.bank_verification_status !== "VERIFIED" && hasBank && (
          <p className="text-xs text-muted-foreground">
            No bank verification provider is connected, so accounts stay “Unverified”. Confirm new
            accounts with the vendor before paying.
          </p>
        )}
      </Section>

      {canManageBank(role) && <BankHistory vendorId={vendor.id} version={vendor.updated_at} />}

      {canManageBank(role) && (
        <BankDetailsDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          vendor={vendor}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

function BankHistory({ vendorId, version }) {
  const history = useRemoteData(() => getBankHistory(vendorId), `${vendorId}-${version}`, {
    fallback: "Bank change history couldn't be loaded.",
  });

  let body;
  if (history.error && !history.data) {
    body = <ErrorState title="Couldn't load the history" description={history.error} onRetry={history.reload} className="py-6" />;
  } else if (!history.data) {
    body = <LoadingState rows={2} className="p-0" />;
  } else if (!history.data.length) {
    body = <p className="text-sm text-muted-foreground">No changes recorded since the vendor was added.</p>;
  } else {
    body = (
      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>When</TableHead>
              <TableHead>By</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>IFSC</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.data.map((change) => (
              <TableRow key={`${change.changed_at}-${change.new_account_mask}`}>
                <TableCell>{formatDateTime(change.changed_at)}</TableCell>
                <TableCell>{change.changed_by__username}</TableCell>
                <TableCell className="font-mono text-xs">
                  {change.previous_account_mask || "none"} → {change.new_account_mask}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {change.previous_ifsc || "none"} → {change.new_ifsc}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }
  return (
    <Section title="Change history" description="Every bank detail change, masked.">
      {body}
    </Section>
  );
}
