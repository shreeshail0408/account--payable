import React, { useEffect, useState } from "react";
import { Ban, CircleCheck, CircleX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { InlineAlert } from "@/components/inline-alert";
import { DescriptionList } from "@/components/page";
import { StatusBadge } from "@/components/status-badge";
import { useRemoteData } from "@/hooks/useRemoteData";
import { formatDateTime } from "@/lib/format";
import { approveOnboarding, getVendor, rejectOnboarding, setVendorStatus } from "./api";
import { canDecideOnboarding, canSetVendorStatus } from "./model";
import { BankTab } from "./tabs/BankTab";
import { GstinTab } from "./tabs/GstinTab";
import { InvoicesTab } from "./tabs/InvoicesTab";
import { OnboardingTab } from "./tabs/OnboardingTab";

const TABS = [
  ["profile", "Profile"],
  ["bank", "Bank details"],
  ["gstin", "GSTIN"],
  ["invoices", "Invoices"],
  ["onboarding", "Onboarding"],
];

/** Vendor record drawer. `summary` is the list row (shown until the fresh record arrives). */
export function VendorDetailSheet({ summary, role, onClose, onChanged }) {
  const open = Boolean(summary);
  const id = summary?.id;
  const fresh = useRemoteData(() => getVendor(id), String(id), {
    enabled: open,
    fallback: "The latest vendor record couldn't be loaded.",
  });
  const [override, setOverride] = useState(null);
  const [tab, setTab] = useState("profile");
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    setOverride(null);
    setTab(summary?.initialTab || "profile");
  }, [id, summary?.initialTab]);

  const loaded = fresh.data && fresh.data.id === id ? fresh.data : null;
  const vendor = override?.id === id ? override : loaded || summary;

  const applyChange = (updated, message) => {
    setOverride(updated);
    onChanged();
    toast.success(message);
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="sm:max-w-2xl">
        {vendor && (
          <>
            <SheetHeader>
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle>{vendor.name}</SheetTitle>
                <StatusBadge kind="vendor" status={vendor.status} />
              </div>
              <SheetDescription>
                {vendor.code} · {vendor.email}
              </SheetDescription>
            </SheetHeader>
            <SheetBody className="flex flex-col gap-6">
              {fresh.error && (
                <InlineAlert tone="danger" onRetry={fresh.reload}>
                  {fresh.error} Showing the list values.
                </InlineAlert>
              )}
              <Tabs value={tab} onValueChange={setTab}>
                <div className="-mx-6 overflow-x-auto px-6">
                  <TabsList>
                    {TABS.map(([value, label]) => (
                      <TabsTrigger key={value} value={value}>
                        {label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
                <TabsContent value="profile" className="mt-6">
                  <ProfileTab vendor={vendor} />
                </TabsContent>
                <TabsContent value="bank" className="mt-6">
                  <BankTab
                    vendor={vendor}
                    role={role}
                    onSaved={(updated) => applyChange(updated, "Bank details saved and marked unverified.")}
                  />
                </TabsContent>
                <TabsContent value="gstin" className="mt-6">
                  <GstinTab
                    vendor={vendor}
                    role={role}
                    onVendorChange={(updated) => {
                      setOverride(updated);
                      onChanged();
                    }}
                  />
                </TabsContent>
                <TabsContent value="invoices" className="mt-6">
                  <InvoicesTab vendor={vendor} role={role} />
                </TabsContent>
                <TabsContent value="onboarding" className="mt-6">
                  <OnboardingTab vendor={vendor} role={role} version={vendor.updated_at} />
                </TabsContent>
              </Tabs>
            </SheetBody>
            <VendorActions vendor={vendor} role={role} onConfirm={setConfirm} />
          </>
        )}
      </SheetContent>

      {vendor && (
        <VendorDecisionDialogs
          vendor={vendor}
          confirm={confirm}
          onClose={() => setConfirm(null)}
          onDone={applyChange}
        />
      )}
    </Sheet>
  );
}

function ProfileTab({ vendor }) {
  return (
    <DescriptionList
      items={[
        { label: "Vendor code", value: vendor.code },
        { label: "Legal name", value: vendor.name },
        { label: "Email", value: vendor.email },
        { label: "Phone", value: vendor.phone || "—" },
        { label: "PAN", value: vendor.pan ? <span className="font-mono">{vendor.pan}</span> : "—" },
        { label: "Status", value: <StatusBadge kind="vendor" status={vendor.status} /> },
        {
          label: "Onboarding",
          value: vendor.onboarding_status
            ? <StatusBadge kind="onboarding" status={vendor.onboarding_status} />
            : "Not tracked (created before onboarding reviews)",
        },
        { label: "Added", value: formatDateTime(vendor.created_at) },
        { label: "Last updated", value: formatDateTime(vendor.updated_at) },
        { label: "Address", value: vendor.address || "—", wide: true },
      ]}
    />
  );
}

/** Footer: onboarding decision while submitted, otherwise block / re-activate (ADMIN only). */
function VendorActions({ vendor, role, onConfirm }) {
  if (canDecideOnboarding(role) && vendor.onboarding_status === "SUBMITTED") {
    return (
      <SheetFooter>
        <Button variant="outline" onClick={() => onConfirm("reject")}>
          <CircleX />
          Reject
        </Button>
        <Button onClick={() => onConfirm("approve")}>
          <CircleCheck />
          Approve onboarding
        </Button>
      </SheetFooter>
    );
  }
  if (!canSetVendorStatus(role)) {
    return null;
  }
  // The server only re-activates vendors whose onboarding was approved (or that predate it).
  const canActivate = !vendor.onboarding_status || vendor.onboarding_status === "APPROVED";
  if (vendor.status === "ACTIVE") {
    return (
      <SheetFooter>
        <Button variant="outline" onClick={() => onConfirm("block")}>
          <Ban />
          Block vendor
        </Button>
      </SheetFooter>
    );
  }
  if (canActivate && vendor.status !== "ACTIVE") {
    return (
      <SheetFooter>
        <Button onClick={() => onConfirm("activate")}>
          <CircleCheck />
          Activate vendor
        </Button>
      </SheetFooter>
    );
  }
  return null;
}

function VendorDecisionDialogs({ vendor, confirm, onClose, onDone }) {
  const close = (next) => !next && onClose();
  return (
    <>
      <ConfirmDialog
        open={confirm === "approve"}
        onOpenChange={close}
        title={`Approve ${vendor.name}?`}
        description="The vendor becomes active, so its invoices can be validated, approved and paid. The person who submitted it is notified."
        confirmLabel="Approve and activate"
        errorFallback="The onboarding couldn't be approved."
        onConfirm={async () => {
          const updated = await approveOnboarding(vendor.id);
          onDone(updated, `${vendor.name} approved and activated.`);
        }}
      />
      <ConfirmDialog
        open={confirm === "reject"}
        onOpenChange={close}
        title={`Reject ${vendor.name}?`}
        description="The vendor is blocked and can't be used for invoices. The submitter sees your reason."
        confirmLabel="Reject vendor"
        destructive
        comment={{
          label: "Reason for rejection",
          placeholder: "e.g. GSTIN doesn't match the registered business name",
          required: true,
          minLength: 2,
        }}
        errorFallback="The onboarding couldn't be rejected."
        onConfirm={async (comments) => {
          const updated = await rejectOnboarding(vendor.id, comments);
          onDone(updated, `${vendor.name} onboarding rejected.`);
        }}
      />
      <ConfirmDialog
        open={confirm === "block"}
        onOpenChange={close}
        title={`Block ${vendor.name}?`}
        description="Blocked vendors can't be used for new invoices or payments until an administrator activates them again."
        confirmLabel="Block vendor"
        destructive
        errorFallback="The vendor couldn't be blocked."
        onConfirm={async () => {
          const updated = await setVendorStatus(vendor.id, "BLOCKED");
          onDone(updated, `${vendor.name} blocked.`);
        }}
      />
      <ConfirmDialog
        open={confirm === "activate"}
        onOpenChange={close}
        title={`Activate ${vendor.name}?`}
        description="The vendor can be used for invoices and payments again."
        confirmLabel="Activate vendor"
        errorFallback="The vendor couldn't be activated."
        onConfirm={async () => {
          const updated = await setVendorStatus(vendor.id, "ACTIVE");
          onDone(updated, `${vendor.name} activated.`);
        }}
      />
    </>
  );
}
