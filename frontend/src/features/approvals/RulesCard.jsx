import React, { useEffect, useState } from "react";
import { GitFork, ListOrdered, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { Amount } from "@/components/amount";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Field, fieldProps } from "@/components/field";
import { InlineAlert } from "@/components/inline-alert";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { useRemoteData } from "@/hooks/useRemoteData";
import { apiErrorMessage } from "@/lib/api-errors";
import { createRule, deleteRule, listApprovers, listRules } from "./api";
import { emptyRule, validateRule } from "./model";

/** ADMIN: the approval matrix (amount bands → approver, order, deadline). */
export function RulesCard() {
  const rules = useRemoteData(listRules, "rules", { fallback: "Approval rules couldn't be loaded." });
  const approvers = useRemoteData(listApprovers, "approvers", { fallback: "Approvers couldn't be loaded." });
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(null);

  const approverName = (id) => approvers.data?.find((candidate) => candidate.id === id)?.username || `User #${id}`;

  return (
    <Card className="overflow-hidden p-0">
      <CardHeader className="pb-6">
        <CardTitle>Approval matrix</CardTitle>
        <CardDescription>Which approver reviews which amount band, in what order, and when it escalates.</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus />
            Add rule
          </Button>
        </CardAction>
      </CardHeader>
      <div className="border-t border-border">
        {approvers.error && (
          <InlineAlert tone="danger" onRetry={approvers.reload} className="m-4">
            {approvers.error} Approver names show as user numbers.
          </InlineAlert>
        )}
        <RulesBody rules={rules} approverName={approverName} onAdd={() => setAdding(true)} onRemove={setRemoving} />
      </div>

      <RuleDialog
        open={adding}
        onOpenChange={setAdding}
        approvers={approvers}
        onCreated={() => {
          rules.reload();
          toast.success("Approval rule added. It applies to invoices submitted from now on.");
        }}
      />
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Delete “${removing?.name}”?`}
        description="Invoices already in approval keep their steps. Rules referenced by existing approvals can't be deleted."
        confirmLabel="Delete rule"
        destructive
        errorFallback="The rule couldn't be deleted."
        onConfirm={async () => {
          await deleteRule(removing.id);
          rules.reload();
          toast.success(`Rule “${removing.name}” deleted.`);
        }}
      />
    </Card>
  );
}

function RulesBody({ rules, approverName, onAdd, onRemove }) {
  if (rules.error && !rules.data) {
    return <ErrorState title="Couldn't load approval rules" description={rules.error} onRetry={rules.reload} />;
  }
  if (!rules.data) {
    return <LoadingState rows={3} />;
  }
  if (!rules.data.length) {
    return (
      <EmptyState
        icon={ListOrdered}
        title="No approval rules yet"
        description="Without rules, invoices can't be submitted for approval. Add one per amount band."
        action={(
          <Button size="sm" onClick={onAdd}>
            <Plus />
            Add rule
          </Button>
        )}
      />
    );
  }
  const sorted = [...rules.data].sort((a, b) => Number(a.min_amount) - Number(b.min_amount) || a.sequence - b.sequence);
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Rule</TableHead>
          <TableHead numeric>From</TableHead>
          <TableHead numeric>Up to</TableHead>
          <TableHead>Approver</TableHead>
          <TableHead numeric>Step</TableHead>
          <TableHead>Routing</TableHead>
          <TableHead numeric>Escalates after</TableHead>
          <TableHead className="w-12">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((rule) => (
          <TableRow key={rule.id}>
            <TableCell className="font-medium">{rule.name}</TableCell>
            <TableCell numeric>
              <Amount value={rule.min_amount} />
            </TableCell>
            <TableCell numeric>
              <Amount value={rule.max_amount} />
            </TableCell>
            <TableCell>{approverName(rule.role)}</TableCell>
            <TableCell numeric>{rule.sequence}</TableCell>
            <TableCell>
              <span className="inline-flex items-center gap-1.5">
                {rule.parallel ? <GitFork className="size-3.5 text-muted-foreground" aria-hidden="true" /> : null}
                {rule.parallel ? "Parallel" : "Sequential"}
              </span>
            </TableCell>
            <TableCell numeric>{rule.escalation_hours} h</TableCell>
            <TableCell>
              <Button variant="ghost" size="icon-sm" aria-label={`Delete rule ${rule.name}`} onClick={() => onRemove(rule)}>
                <Trash2 />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function RuleDialog({ open, onOpenChange, approvers, onCreated }) {
  const [rule, setRule] = useState(emptyRule);
  const [showErrors, setShowErrors] = useState(false);
  const [serverError, setServerError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setRule(emptyRule());
      setShowErrors(false);
      setServerError("");
    }
  }, [open]);

  const errors = showErrors ? validateRule(rule) : {};
  const set = (name) => (event) => setRule((current) => ({ ...current, [name]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setShowErrors(true);
    if (Object.keys(validateRule(rule)).length) {
      return;
    }
    setSaving(true);
    setServerError("");
    try {
      await createRule(rule);
      onOpenChange(false);
      onCreated();
    } catch (error) {
      setServerError(apiErrorMessage(error, { fallback: "The approval rule couldn't be saved." }));
    } finally {
      setSaving(false);
    }
  };

  const approverOptions = approvers.data || [];

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={submit} noValidate className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>Add approval rule</DialogTitle>
            <DialogDescription>
              Invoices whose total falls in the band get a step for this approver. Steps run in order;
              parallel steps with the same number run together.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="rule-name" label="Rule name" required error={errors.name} className="sm:col-span-2">
              <Input {...fieldProps("rule-name", errors.name)} value={rule.name} onChange={set("name")} autoFocus />
            </Field>
            <Field id="rule-min" label="From amount (₹)" required error={errors.min_amount}>
              <Input
                {...fieldProps("rule-min", errors.min_amount)}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={rule.min_amount}
                onChange={set("min_amount")}
              />
            </Field>
            <Field id="rule-max" label="Up to amount (₹)" required error={errors.max_amount}>
              <Input
                {...fieldProps("rule-max", errors.max_amount)}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={rule.max_amount}
                onChange={set("max_amount")}
              />
            </Field>
            <Field id="rule-approver" label="Approver" required error={errors.role || approvers.error}>
              <Select
                value={rule.role ? String(rule.role) : ""}
                onValueChange={(role) => setRule((current) => ({ ...current, role }))}
                disabled={!approvers.data}
              >
                <SelectTrigger {...fieldProps("rule-approver", errors.role || approvers.error)}>
                  <SelectValue placeholder={approvers.loading ? "Loading approvers…" : "Choose an approver"} />
                </SelectTrigger>
                <SelectContent>
                  {approverOptions.map((candidate) => (
                    <SelectItem key={candidate.id} value={String(candidate.id)}>
                      {candidate.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {approvers.data && !approverOptions.length && (
                <p className="text-xs text-muted-foreground">No active approvers. Activate an Approver on the Employees page.</p>
              )}
            </Field>
            <Field id="rule-sequence" label="Step number" required error={errors.sequence}>
              <Input
                {...fieldProps("rule-sequence", errors.sequence)}
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={rule.sequence}
                onChange={set("sequence")}
              />
            </Field>
            <Field id="rule-escalation" label="Escalate after (hours)" required error={errors.escalation_hours}>
              <Input
                {...fieldProps("rule-escalation", errors.escalation_hours)}
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={rule.escalation_hours}
                onChange={set("escalation_hours")}
              />
            </Field>
            <Field id="rule-routing" label="Routing">
              <Select
                value={rule.parallel ? "parallel" : "sequential"}
                onValueChange={(value) => setRule((current) => ({ ...current, parallel: value === "parallel" }))}
              >
                <SelectTrigger {...fieldProps("rule-routing")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sequential">Sequential</SelectItem>
                  <SelectItem value="parallel">Parallel with the same step</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          {serverError && <InlineAlert tone="danger">{serverError}</InlineAlert>}
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Save rule
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
