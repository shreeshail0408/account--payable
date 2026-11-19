import React, { useState } from "react";
import { Fingerprint, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { InlineAlert } from "@/components/inline-alert";
import { DescriptionList, Section } from "@/components/page";
import { EmptyState } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { useRemoteData } from "@/hooks/useRemoteData";
import { apiErrorMessage } from "@/lib/api-errors";
import { formatDateTime } from "@/lib/format";
import { getIntegrationStatus, getVendor, verifyGstin } from "../api";
import { GstinFormatBadge } from "../GstinFormatBadge";
import { canVerifyGstin } from "../model";

/**
 * GSTIN: a local format check, plus the provider verification status. The "Verify" button only
 * appears when a GST provider is configured (integrations/status) and the role may verify.
 */
export function GstinTab({ vendor, role, onVendorChange }) {
  const mayVerify = canVerifyGstin(role) && Boolean(vendor.gstin);
  const integrations = useRemoteData(getIntegrationStatus, "integrations", {
    enabled: mayVerify,
    fallback: "Couldn't check whether GST verification is configured.",
  });
  const [verifying, setVerifying] = useState(false);
  const configured = Boolean(integrations.data?.gst?.configured);

  const verify = async () => {
    setVerifying(true);
    try {
      const result = await verifyGstin(vendor.id);
      if (result.valid) {
        toast.success(`${vendor.gstin} verified by the GST provider.`);
      } else {
        toast.error(`The GST provider reports ${vendor.gstin} as not valid.`);
      }
    } catch (error) {
      toast.error(apiErrorMessage(error, { fallback: "GST verification failed." }));
    } finally {
      // The status is updated on the server for success and failure alike.
      try {
        onVendorChange(await getVendor(vendor.id));
      } catch {
        // The list refresh in onVendorChange is best effort; the toast already reported the outcome.
      }
      setVerifying(false);
    }
  };

  if (!vendor.gstin) {
    return (
      <EmptyState
        icon={Fingerprint}
        title="No GSTIN on file"
        description="Invoices from this vendor can't be checked against a GSTIN until one is added to the vendor record."
        className="py-8"
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Section
        title="GSTIN"
        aside={mayVerify && configured && (
          <Button size="sm" onClick={verify} loading={verifying}>
            {!verifying && <ShieldCheck />}
            Verify with provider
          </Button>
        )}
      >
        <DescriptionList
          items={[
            { label: "GSTIN", value: <span className="font-mono">{vendor.gstin}</span> },
            { label: "Format check", value: <GstinFormatBadge gstin={vendor.gstin} /> },
            {
              label: "Provider verification",
              value: <StatusBadge kind="verification" status={vendor.gst_verification_status || "UNVERIFIED"} />,
            },
            { label: "Last checked", value: formatDateTime(vendor.gst_verification_checked_at) },
          ]}
        />
      </Section>

      <p className="text-xs text-muted-foreground">
        The format check runs in your browser against the GSTIN pattern (state code, PAN, entity
        number, “Z”, check character). Only “Verified” comes from a registry lookup.
      </p>

      {mayVerify && integrations.error && (
        <InlineAlert tone="danger" onRetry={integrations.reload}>
          {integrations.error}
        </InlineAlert>
      )}
      {mayVerify && integrations.data && !configured && (
        <InlineAlert tone="info" title="External GST verification isn't configured">
          Set GST_VALIDATION_URL and GST_VALIDATION_TOKEN on the server to verify GSTINs with a provider.
        </InlineAlert>
      )}
    </div>
  );
}
