import React from "react";
import { Ban, CircleCheck, CircleX, Clock, Eye, Landmark, Send, UserPlus } from "lucide-react";
import { InlineAlert } from "@/components/inline-alert";
import { Section } from "@/components/page";
import { ErrorState, LoadingState } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { Timeline } from "@/components/timeline";
import { useRemoteData } from "@/hooks/useRemoteData";
import { listVendorAudit, listVendorOnboardings } from "../api";
import { canDecideOnboarding, canReadAudit, canReadOnboardings, vendorTimeline } from "../model";

const KIND_META = {
  submitted: { icon: Send, tone: "info" },
  approved: { icon: CircleCheck, tone: "success" },
  rejected: { icon: CircleX, tone: "danger" },
  pending: { icon: Clock, tone: "warning" },
  status: { icon: Ban, tone: "neutral" },
};

function auditIcon(title) {
  if (title.startsWith("Bank")) {
    return Landmark;
  }
  if (title.startsWith("Full bank")) {
    return Eye;
  }
  if (title.startsWith("Vendor record")) {
    return UserPlus;
  }
  return undefined;
}

/** Onboarding record + (ADMIN/AUDITOR) the vendor's audit trail, as one timeline. */
export function OnboardingTab({ vendor, role, version }) {
  const readsOnboarding = canReadOnboardings(role);
  const readsAudit = canReadAudit(role);
  const key = `${vendor.id}-${version}`;
  const onboarding = useRemoteData(() => listVendorOnboardings(vendor.id), key, {
    enabled: readsOnboarding,
    fallback: "The onboarding record couldn't be loaded.",
  });
  const audit = useRemoteData(() => listVendorAudit(vendor.id), key, {
    enabled: readsAudit,
    fallback: "The vendor's audit history couldn't be loaded.",
  });

  const header = (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Current onboarding status</span>
      {vendor.onboarding_status
        ? <StatusBadge kind="onboarding" status={vendor.onboarding_status} />
        : <span>Not tracked</span>}
    </div>
  );

  if (!readsOnboarding) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <p className="text-sm text-muted-foreground">
          Onboarding history is visible to administrators, AP clerks and auditors.
        </p>
      </div>
    );
  }
  if (onboarding.error && !onboarding.data) {
    return <ErrorState title="Couldn't load onboarding" description={onboarding.error} onRetry={onboarding.reload} />;
  }
  if (!onboarding.data || (readsAudit && !audit.data && !audit.error)) {
    return <LoadingState rows={3} className="p-0" />;
  }

  const record = onboarding.data[0] || null;
  const items = vendorTimeline(record, audit.data).map((item) => {
    const meta = KIND_META[item.kind] || { tone: "neutral", icon: auditIcon(item.title) };
    return { ...item, tone: meta.tone, icon: meta.icon || auditIcon(item.title) };
  });

  return (
    <div className="flex flex-col gap-6">
      {header}
      {audit.error && (
        <InlineAlert tone="danger" onRetry={audit.reload}>
          {audit.error} The onboarding steps below are still accurate.
        </InlineAlert>
      )}
      {role === "AP_CLERK" && !record && vendor.onboarding_status && (
        <p className="text-sm text-muted-foreground">
          AP clerks see the onboarding history of vendors they submitted.
        </p>
      )}
      {!record && !vendor.onboarding_status && (
        <p className="text-sm text-muted-foreground">
          This vendor was added before onboarding reviews were introduced (seeded or imported).
        </p>
      )}
      {items.length > 0 && (
        <Section title="Timeline">
          <Timeline items={items} />
        </Section>
      )}
      {record?.status === "SUBMITTED" && canDecideOnboarding(role) && (
        <p className="text-sm text-muted-foreground">Use Approve or Reject below to decide.</p>
      )}
    </div>
  );
}
