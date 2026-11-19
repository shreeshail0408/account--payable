import React, { useEffect, useState } from "react";
import { CircleCheck, CircleX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InlineAlert } from "@/components/inline-alert";
import { REJECT_MIN_LENGTH } from "./model";

/**
 * Desktop decision panel: one comment box, Approve and Reject. Reject stays disabled until the
 * comment is long enough, and says why.
 */
export function DecisionForm({ approval, decision }) {
  const [comment, setComment] = useState("");
  const { reset } = decision;

  useEffect(() => {
    setComment("");
    reset();
  }, [approval.id, reset]);

  const reasonReady = comment.trim().length >= REJECT_MIN_LENGTH;
  const busy = Boolean(decision.busy);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        decision.decide(approval, "approve", comment);
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="decision-comment">Comment</Label>
        <Textarea
          id="decision-comment"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Optional when approving; required to reject"
          aria-describedby="decision-comment-hint"
        />
        <p id="decision-comment-hint" className="text-xs text-muted-foreground">
          {reasonReady ? "The comment is saved with your decision." : "Rejecting needs a reason the submitter will see."}
        </p>
      </div>
      {decision.error && <InlineAlert tone="danger">{decision.error}</InlineAlert>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          className="text-danger"
          disabled={busy || !reasonReady}
          loading={decision.busy === "reject"}
          onClick={() => decision.decide(approval, "reject", comment)}
        >
          {decision.busy !== "reject" && <CircleX />}
          Reject
        </Button>
        <Button type="submit" disabled={busy} loading={decision.busy === "approve"}>
          {decision.busy !== "approve" && <CircleCheck />}
          Approve
        </Button>
      </div>
    </form>
  );
}
