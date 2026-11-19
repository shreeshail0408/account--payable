import React from "react";
import { AlarmClock, CircleCheck, CircleDashed, CircleX, Clock, GitFork } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/*
 * Approval steps grouped by sequence. Steps in one sequence whose rules are all parallel run at
 * the same time (every one must approve); otherwise steps in a sequence run one after another,
 * as in services.notify_current_approval_step.
 */
export function groupSteps(steps) {
  const bySequence = new Map();
  steps.forEach((step) => {
    if (!bySequence.has(step.sequence)) {
      bySequence.set(step.sequence, []);
    }
    bySequence.get(step.sequence).push(step);
  });
  const groups = [];
  [...bySequence.keys()].sort((a, b) => a - b).forEach((sequence) => {
    const members = bySequence.get(sequence);
    if (members.length > 1 && members.every((step) => step.parallel)) {
      groups.push({ key: `seq-${sequence}`, sequence, parallel: true, steps: members });
    } else {
      members.forEach((step) => groups.push({ key: `step-${step.id}`, sequence, parallel: false, steps: [step] }));
    }
  });
  return groups;
}

function groupState(group) {
  const statuses = group.steps.map((step) => step.status);
  if (statuses.includes("REJECTED")) {
    return "rejected";
  }
  if (statuses.every((status) => status === "APPROVED")) {
    return "done";
  }
  if (group.steps.some((step) => step.due_at)) {
    return "active";
  }
  return "waiting";
}

const STATE_META = {
  done: { icon: CircleCheck, className: "border-success-border bg-success-subtle text-success" },
  rejected: { icon: CircleX, className: "border-danger-border bg-danger-subtle text-danger" },
  active: { icon: Clock, className: "border-warning-border bg-warning-subtle text-warning-subtle-foreground" },
  waiting: { icon: CircleDashed, className: "border-border bg-muted text-muted-foreground" },
};

export function ApprovalStepper({ steps }) {
  const groups = groupSteps(steps);
  return (
    <ol className="flex flex-col">
      {groups.map((group, index) => {
        const state = groupState(group);
        const meta = STATE_META[state];
        const Icon = group.parallel ? GitFork : meta.icon;
        const last = index === groups.length - 1;
        return (
          <li key={group.key} className="relative flex gap-3 pb-6 last:pb-0">
            {!last && (
              <span
                aria-hidden="true"
                className={cn("absolute left-4 top-9 -bottom-0 w-px", state === "done" ? "bg-success" : "bg-border")}
              />
            )}
            <span className={cn("relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border", meta.className)}>
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
              <p className="text-xs font-medium text-muted-foreground">
                Step {index + 1}
                {group.parallel && ` · ${group.steps.length} approvers in parallel — all must approve`}
                <span className="sr-only">, {state}</span>
              </p>
              <div className={cn("flex flex-col gap-2", group.parallel && "sm:grid sm:grid-cols-2")}>
                {group.steps.map((step) => (
                  <StepCard key={step.id} step={step} boxed={group.parallel} />
                ))}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function StepCard({ step, boxed }) {
  const pending = step.status === "PENDING" || step.status === "ESCALATED";
  const overdue = pending && step.due_at && new Date(step.due_at) < new Date();
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", boxed && "rounded-md border border-border p-3")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 truncate text-sm font-medium">{step.approver_name}</span>
        <StatusBadge kind="approval" status={step.status} />
      </div>
      <p className="text-xs text-muted-foreground">{step.rule_name}</p>
      {step.decided_at && (
        <p className="text-xs text-muted-foreground">Decided {formatDateTime(step.decided_at)}</p>
      )}
      {pending && step.due_at && (
        <p className={cn("inline-flex items-center gap-1 text-xs", overdue ? "font-medium text-danger" : "text-muted-foreground")}>
          <AlarmClock className="size-3.5" aria-hidden="true" />
          {overdue ? "Overdue since" : "Due"} {formatRelativeTime(step.due_at)}
        </p>
      )}
      {pending && !step.due_at && (
        <p className="text-xs text-muted-foreground">Starts after the previous step</p>
      )}
      {step.comments && (
        <p className="rounded-sm bg-muted px-2 py-1 text-xs text-foreground">“{step.comments}”</p>
      )}
    </div>
  );
}
