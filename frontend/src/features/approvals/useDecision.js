import { useCallback, useState } from "react";
import { toast } from "@/components/ui/toast";
import { apiErrorMessage } from "@/lib/api-errors";
import { approveStep, rejectStep } from "./api";
import { DECISION_FORBIDDEN, REJECT_MIN_LENGTH } from "./model";

/** Approve / reject one step. Resolves true on success; on failure keeps the error for display. */
export function useDecision({ onSettled }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const decide = useCallback(async (approval, action, comment) => {
    const text = comment.trim();
    if (action === "reject" && text.length < REJECT_MIN_LENGTH) {
      setError("Enter a rejection reason of at least two characters.");
      return false;
    }
    setBusy(action);
    setError("");
    try {
      if (action === "approve") {
        await approveStep(approval.id, text);
        toast.success(`${approval.invoice_number || "Invoice"} approved.`);
      } else {
        await rejectStep(approval.id, text);
        toast.success(`${approval.invoice_number || "Invoice"} rejected.`, {
          description: "The invoice's creator is notified with your reason.",
        });
      }
      onSettled(approval, true);
      return true;
    } catch (err) {
      const message = apiErrorMessage(err, {
        fallback: "The decision couldn't be saved.",
        forbidden: DECISION_FORBIDDEN,
      });
      setError(message);
      toast.error(`${approval.invoice_number || "Invoice"}: ${action === "approve" ? "approval" : "rejection"} failed.`, {
        description: message,
      });
      // The step may have been decided or reassigned elsewhere: refresh the queue behind the form.
      onSettled(approval, false);
      return false;
    } finally {
      setBusy("");
    }
  }, [onSettled]);

  const reset = useCallback(() => setError(""), []);
  return { decide, busy, error, reset };
}
