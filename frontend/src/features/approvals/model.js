/*
 * Approval queue rules. Server checks (ApprovalViewSet): APPROVER sees and decides only their own
 * steps; ADMIN sees and may decide all; AUDITOR reads all. A step is actionable once the workflow
 * has activated it (due_at set) while the invoice is still pending approval; rejecting needs a
 * reason of at least two characters.
 */
export const OPEN_STATUSES = ["PENDING", "ESCALATED"];
export const REJECT_MIN_LENGTH = 2;

export const QUEUE_FORBIDDEN = "Your role can't view the approval queue. It's available to administrators, "
  + "approvers and auditors. If your role was changed recently, sign out and sign in again.";
export const DECISION_FORBIDDEN = "You can't decide this approval. Only the assigned approver (or an "
  + "administrator) can approve or reject it. If your role was changed recently, sign out and sign in again.";

export const canDecideRole = (role) => ["ADMIN", "APPROVER"].includes(role);
export const canManageRules = (role) => role === "ADMIN";

export function isOpen(approval) {
  return OPEN_STATUSES.includes(approval.status);
}

/** Decidable by this user right now. */
export function isActionable(approval, user) {
  if (!user || !canDecideRole(user.role) || !isOpen(approval) || !approval.due_at) {
    return false;
  }
  if (approval.invoice_status && approval.invoice_status !== "PENDING_APPROVAL") {
    return false;
  }
  return user.role === "ADMIN" || approval.approver === user.id;
}

/** Open but not yet activated: an earlier sequential step is still pending. */
export function isWaiting(approval) {
  return isOpen(approval) && !approval.due_at;
}

export function isOverdue(approval, now = new Date()) {
  return isOpen(approval) && approval.due_at && new Date(approval.due_at) < now;
}

/** Most urgent first: overdue, then by due time; decided ones by most recent decision. */
export function sortQueue(rows) {
  return [...rows].sort((a, b) => {
    const openDiff = Number(isOpen(b)) - Number(isOpen(a));
    if (openDiff) {
      return openDiff;
    }
    if (isOpen(a)) {
      const aDue = a.due_at ? new Date(a.due_at).getTime() : Infinity;
      const bDue = b.due_at ? new Date(b.due_at).getTime() : Infinity;
      return aDue - bDue;
    }
    return new Date(b.decided_at || 0) - new Date(a.decided_at || 0);
  });
}

export const VIEWS = {
  todo: { label: "To decide", test: isActionable },
  open: { label: "Open", test: (approval) => isOpen(approval) },
  all: { label: "All", test: () => true },
};

/** Tabs per role: deciders get "To decide"; auditors (read-only) start at "Open". */
export function viewsFor(role) {
  return canDecideRole(role) ? ["todo", "open", "all"] : ["open", "all"];
}

export const emptyRule = () => ({
  name: "",
  min_amount: "0",
  max_amount: "",
  role: "",
  sequence: "1",
  parallel: false,
  escalation_hours: "24",
});

export function validateRule(rule) {
  const errors = {};
  if (!rule.name.trim()) {
    errors.name = "Name the rule.";
  }
  const min = Number(rule.min_amount);
  const max = Number(rule.max_amount);
  if (rule.min_amount === "" || !(min >= 0)) {
    errors.min_amount = "0 or more.";
  }
  if (rule.max_amount === "" || !(max > 0)) {
    errors.max_amount = "More than 0.";
  } else if (min >= 0 && max < min) {
    errors.max_amount = "Must be at least the minimum.";
  }
  if (!rule.role) {
    errors.role = "Choose who approves.";
  }
  if (!(Number.parseInt(rule.sequence, 10) >= 1)) {
    errors.sequence = "1 or more.";
  }
  if (!(Number.parseInt(rule.escalation_hours, 10) >= 1)) {
    errors.escalation_hours = "1 hour or more.";
  }
  return errors;
}
