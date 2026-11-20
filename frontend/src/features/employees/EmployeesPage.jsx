import React, { useMemo, useState } from "react";
import { KeyRound, Lock, SearchX, UserPlus, Users } from "lucide-react";
import { ROLE_LABELS, useAuth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable, SortHeader } from "@/components/data-table";
import { Page, PageHeader } from "@/components/page";
import { SearchInput } from "@/components/search-input";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { useListQuery } from "@/hooks/useListQuery";
import { useRemoteData } from "@/hooks/useRemoteData";
import { formatDateTime } from "@/lib/format";
import { listEmployees, resetEmployeePassword, setEmployeeActive } from "./api";
import { EmployeeFormDialog } from "./EmployeeFormDialog";
import { TemporaryPasswordDialog } from "./TemporaryPasswordDialog";

const PAGE_SIZE = 20;

function fullName(employee) {
  return [employee.first_name, employee.last_name].filter(Boolean).join(" ");
}

function matches(employee, term) {
  if (!term) {
    return true;
  }
  const needle = term.toLowerCase();
  return [employee.username, employee.email, fullName(employee), ROLE_LABELS[employee.role]]
    .some((value) => String(value || "").toLowerCase().includes(needle));
}

export default function EmployeesPage() {
  const { user } = useAuth();
  const query = useListQuery(["search"]);
  const search = query.values.search;
  const employees = useRemoteData(listEmployees, "employees", { fallback: "Employee accounts couldn't be loaded." });
  const [createOpen, setCreateOpen] = useState(false);
  const [toggling, setToggling] = useState(null);
  const [resetting, setResetting] = useState(null);
  const [resetResult, setResetResult] = useState(null);
  const actions = useMemo(() => ({ onToggle: setToggling, onReset: setResetting }), []);

  const rows = useMemo(() => (employees.data || []).filter((employee) => matches(employee, search)), [employees.data, search]);
  const columns = useEmployeeColumns(user, actions);

  const confirmReset = async () => {
    const result = await resetEmployeePassword(resetting.id);
    employees.reload();
    setResetResult(result);
    toast.success(`Password reset for ${result.employee.username}. They were signed out everywhere.`);
  };

  return (
    <Page>
      <PageHeader
        title="Employees"
        description="Administrator-managed accounts and roles; new accounts stay inactive until enabled"
        actions={(
          <Button onClick={() => setCreateOpen(true)}>
            <UserPlus />
            Add employee
          </Button>
        )}
      />

      {/* Block wrapper: SearchInput's flex-1/basis sizing is meant for toolbar rows, not this column. */}
      <div className="max-w-md">
        <SearchInput
          id="employee-search"
          value={search}
          onChange={(value) => query.update({ search: value })}
          placeholder="Name, username, email or role"
        />
      </div>

      <Card className="overflow-hidden p-0">
        <EmployeeListBody
          employees={employees}
          rows={rows}
          columns={columns}
          search={search}
          onClearSearch={() => query.update({ search: "" })}
          onCreate={() => setCreateOpen(true)}
          actions={actions}
          currentUserId={user?.id}
        />
      </Card>

      <EmployeeFormDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={employees.reload} />

      <ConfirmDialog
        open={Boolean(toggling)}
        onOpenChange={(open) => !open && setToggling(null)}
        title={toggling?.is_active ? `Deactivate ${toggling?.username}?` : `Activate ${toggling?.username}?`}
        description={toggling?.is_active
          ? "They are signed out at their next request and can't sign in until reactivated. Their records and audit history are kept."
          : `They can sign in as ${ROLE_LABELS[toggling?.role] || "their role"} with the temporary password you shared, then choose their own.`}
        confirmLabel={toggling?.is_active ? "Deactivate" : "Activate"}
        destructive={Boolean(toggling?.is_active)}
        errorFallback="The account's access couldn't be changed."
        onConfirm={async () => {
          const updated = await setEmployeeActive(toggling.id, !toggling.is_active);
          employees.reload();
          toast.success(`${updated.username} ${updated.is_active ? "activated" : "deactivated"}.`);
        }}
      />

      <ConfirmDialog
        open={Boolean(resetting)}
        onOpenChange={(open) => !open && setResetting(null)}
        title={`Reset the password for ${resetting?.username}?`}
        description={(
          "Their current password stops working and they are signed out on every device. "
          + "You'll get a temporary password to share; they must replace it at their next sign-in. "
          + "This also unlocks an account locked by failed sign-ins."
        )}
        confirmLabel="Reset password"
        errorFallback="The password couldn't be reset."
        onConfirm={confirmReset}
      />
      <TemporaryPasswordDialog result={resetResult} onClose={() => setResetResult(null)} />
    </Page>
  );
}

function EmployeeListBody({ employees, rows, columns, search, onClearSearch, onCreate, actions, currentUserId }) {
  if (employees.error && !employees.data) {
    return <ErrorState title="Couldn't load employees" description={employees.error} onRetry={employees.reload} />;
  }
  if (!employees.data) {
    return <LoadingState rows={6} />;
  }
  if (!rows.length) {
    return search ? (
      <EmptyState
        icon={SearchX}
        title={`No employees match “${search}”`}
        action={<Button variant="outline" size="sm" onClick={onClearSearch}>Clear search</Button>}
      />
    ) : (
      <EmptyState
        icon={Users}
        title="No employee accounts yet"
        description="Add AP clerks, approvers, accountants and auditors so work can be routed to them."
        action={(
          <Button size="sm" onClick={onCreate}>
            <UserPlus />
            Add employee
          </Button>
        )}
      />
    );
  }
  return (
    <DataTable
      columns={columns}
      data={rows}
      pageSize={PAGE_SIZE}
      label="Employee pages"
      busy={employees.loading}
      renderMobileItem={(employee) => (
        <MobileEmployeeItem employee={employee} isSelf={employee.id === currentUserId} actions={actions} />
      )}
    />
  );
}

function RowActions({ employee, isSelf, actions }) {
  if (isSelf) {
    return <span className="text-xs text-muted-foreground">You</span>;
  }
  return (
    <span className="flex flex-wrap justify-end gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => actions.onReset(employee)}
        aria-label={`Reset password for ${employee.username}`}
      >
        <KeyRound />
        Reset password
      </Button>
      <Button variant="outline" size="sm" onClick={() => actions.onToggle(employee)}>
        {employee.is_active ? "Deactivate" : "Activate"}
      </Button>
    </span>
  );
}

/** Access badge plus sign-in markers: locked by failed attempts, or still on a temporary password. */
function AccessStatus({ employee }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <StatusBadge kind="employee" status={employee.is_active ? "ACTIVE" : "BLOCKED"} />
      {employee.is_locked && (
        <Badge variant="danger">
          <Lock aria-hidden="true" />
          Locked
        </Badge>
      )}
      {employee.must_change_password && (
        <Badge variant="warning">Temporary password</Badge>
      )}
    </span>
  );
}

function lastSignIn(employee) {
  return employee.last_login ? formatDateTime(employee.last_login) : "Never";
}

function useEmployeeColumns(user, actions) {
  return useMemo(() => [
    {
      id: "username",
      accessorKey: "username",
      header: ({ column }) => <SortHeader column={column}>Employee</SortHeader>,
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span className="font-medium">{fullName(row.original) || row.original.username}</span>
          <span className="text-xs text-muted-foreground">{row.original.username}</span>
        </span>
      ),
    },
    {
      id: "email",
      accessorKey: "email",
      header: ({ column }) => <SortHeader column={column}>Email</SortHeader>,
      cell: ({ row }) => <span className="block max-w-64 truncate">{row.original.email}</span>,
    },
    {
      id: "role",
      accessorKey: "role",
      header: ({ column }) => <SortHeader column={column}>Role</SortHeader>,
      cell: ({ row }) => (
        <Badge variant={row.original.role === "ADMIN" ? "primary" : "outline"}>
          {ROLE_LABELS[row.original.role] || row.original.role}
        </Badge>
      ),
    },
    {
      id: "is_active",
      accessorKey: "is_active",
      header: ({ column }) => <SortHeader column={column}>Access</SortHeader>,
      cell: ({ row }) => <AccessStatus employee={row.original} />,
    },
    {
      id: "last_login",
      accessorFn: (employee) => employee.last_login || "",
      header: ({ column }) => <SortHeader column={column}>Last sign-in</SortHeader>,
      cell: ({ row }) => (
        <span className={row.original.last_login ? undefined : "text-muted-foreground"}>
          {lastSignIn(row.original)}
        </span>
      ),
    },
    {
      id: "actions",
      meta: { className: "text-right" },
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <RowActions employee={row.original} isSelf={row.original.id === user?.id} actions={actions} />
      ),
    },
  ], [user, actions]);
}

function MobileEmployeeItem({ employee, isSelf, actions }) {
  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate font-medium">{fullName(employee) || employee.username}</span>
        <span className="truncate text-sm text-muted-foreground">{employee.email}</span>
        <span className="flex flex-wrap items-center gap-2 pt-1">
          <Badge variant={employee.role === "ADMIN" ? "primary" : "outline"}>
            {ROLE_LABELS[employee.role] || employee.role}
          </Badge>
          <AccessStatus employee={employee} />
        </span>
        <span className="text-xs text-muted-foreground">{`Last sign-in: ${lastSignIn(employee)}`}</span>
      </div>
      <RowActions employee={employee} isSelf={isSelf} actions={actions} />
    </div>
  );
}
