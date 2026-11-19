import React, { useEffect, useState } from "react";
import api from "../services/api";
import { PageHeader, Status, Loader, Empty, Modal } from "../components/UI";
import { useAuth } from "../App";
import { apiErrorMessage } from "../lib/api-errors";

const blankRule = {
  name: "",
  min_amount: "0",
  max_amount: "",
  role: "",
  sequence: "1",
  parallel: false,
  escalation_hours: "24",
};

const QUEUE_FORBIDDEN = "Your role can't view the approval queue. It's available to administrators, approvers and "
  + "auditors. If your role was changed recently, sign out and sign in again.";
const DECISION_FORBIDDEN = "You can't decide this approval. Only the assigned approver (or an administrator) can "
  + "approve or reject it. If your role was changed recently, sign out and sign in again.";

function rowsOf(response) {
  return response.data.results || response.data;
}

export default function Approvals() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [rows, setRows] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [rules, setRules] = useState([]);
  const [approvers, setApprovers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [queueError, setQueueError] = useState("");
  const [rulesError, setRulesError] = useState("");
  const [pageError, setPageError] = useState("");

  const [selected, setSelected] = useState(null);
  const [comments, setComments] = useState("");
  const [decisionError, setDecisionError] = useState("");
  const [deciding, setDeciding] = useState(false);

  const [ruleOpen, setRuleOpen] = useState(false);
  const [rule, setRule] = useState(blankRule);

  const loadQueue = async () => {
    try {
      const [approvalResponse, reminderResponse] = await Promise.all([
        api.get("/approvals/"),
        api.get("/approvals/reminders/"),
      ]);
      setRows(rowsOf(approvalResponse));
      setReminders(reminderResponse.data);
      setQueueError("");
    } catch (err) {
      setQueueError(apiErrorMessage(err, {
        fallback: "Unable to load the approval queue.",
        forbidden: QUEUE_FORBIDDEN,
      }));
    }
  };

  const loadRules = async () => {
    if (!isAdmin) {
      return;
    }
    try {
      const [ruleResponse, approverResponse] = await Promise.all([
        api.get("/approval-rules/"),
        api.get("/approval-rules/approvers/"),
      ]);
      setRules(rowsOf(ruleResponse));
      setApprovers(approverResponse.data);
      setRulesError("");
    } catch (err) {
      setRulesError(apiErrorMessage(err, { fallback: "Unable to load approval rules." }));
    }
  };

  const load = async () => {
    await Promise.all([loadQueue(), loadRules()]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openReview = (item) => {
    setSelected(item);
    setComments("");
    setDecisionError("");
  };

  const closeReview = () => {
    setSelected(null);
    setDecisionError("");
  };

  const decide = async (action) => {
    setDecisionError("");
    if (action === "reject" && comments.trim().length < 2) {
      setDecisionError("Enter a rejection reason of at least two characters.");
      return;
    }
    setDeciding(true);
    try {
      await api.post(`/approvals/${selected.id}/${action}/`, { comments });
      closeReview();
      setComments("");
      await loadQueue();
    } catch (err) {
      setDecisionError(apiErrorMessage(err, {
        fallback: "Could not save the approval decision.",
        forbidden: DECISION_FORBIDDEN,
      }));
      // The record may have changed (decided elsewhere, reassigned); refresh the list behind the dialog.
      loadQueue();
    } finally {
      setDeciding(false);
    }
  };

  const escalate = async () => {
    setPageError("");
    try {
      await api.post("/approvals/escalate-overdue/");
      await loadQueue();
    } catch (err) {
      setPageError(apiErrorMessage(err, { fallback: "Could not process overdue approvals." }));
    }
  };

  const saveRule = async (event) => {
    event.preventDefault();
    setPageError("");
    try {
      await api.post("/approval-rules/", rule);
      setRule(blankRule);
      setRuleOpen(false);
      await loadRules();
    } catch (err) {
      setPageError(apiErrorMessage(err, { fallback: "Could not save the approval rule." }));
    }
  };

  const deleteRule = async (id) => {
    setPageError("");
    try {
      await api.delete(`/approval-rules/${id}/`);
      await loadRules();
    } catch (err) {
      setPageError(apiErrorMessage(err, { fallback: "Could not delete the approval rule." }));
    }
  };

  const headerActions = isAdmin && (
    <>
      <button className="secondary" onClick={() => setRuleOpen(true)}>Add approval rule</button>
      {" "}
      <button className="secondary" onClick={escalate}>Process overdue</button>
    </>
  );

  return (
    <>
      <PageHeader
        title="Approvals"
        subtitle="Configurable and role-based approval queue"
        action={headerActions}
      />

      {pageError && <div className="alert error" role="alert">{pageError}</div>}

      {reminders.length > 0 && (
        <div className="reminder-banner">
          <b>Approval reminders</b>
          <span>
            {reminders.length} approval{reminders.length === 1 ? " is" : "s are"} due or overdue within the next 24 hours.
          </span>
        </div>
      )}

      {isAdmin && (
        <section className="panel table-panel" style={{ marginBottom: 16 }}>
          <div className="panel-head">
            <h3>Approval matrix</h3>
            <span>Amount ranges and routing order</span>
          </div>
          <RulesTable
            loading={loading}
            error={rulesError}
            rules={rules}
            approvers={approvers}
            onDelete={deleteRule}
          />
        </section>
      )}

      <div className="panel table-panel">
        <QueueTable
          loading={loading}
          error={queueError}
          rows={rows}
          canReview={user?.role === "APPROVER"}
          onReview={openReview}
        />
      </div>

      <Modal open={!!selected} title={`Review ${selected?.invoice_number || ""}`} onClose={closeReview}>
        <div className="form-grid">
          {decisionError && (
            <div className="alert error span-2" role="alert">{decisionError}</div>
          )}
          <label className="span-2">
            Comments
            <textarea
              value={comments}
              onChange={(event) => setComments(event.target.value)}
              placeholder="A rejection reason is required"
            />
          </label>
          <div className="form-actions">
            <button
              className="danger"
              disabled={deciding || comments.trim().length < 2}
              onClick={() => decide("reject")}
            >
              Reject
            </button>
            <button className="primary" disabled={deciding} onClick={() => decide("approve")}>
              {deciding ? "Saving…" : "Approve"}
            </button>
          </div>
        </div>
      </Modal>

      <RuleModal
        open={ruleOpen}
        rule={rule}
        approvers={approvers}
        onChange={setRule}
        onClose={() => setRuleOpen(false)}
        onSubmit={saveRule}
      />
    </>
  );
}

function QueueTable({ loading, error, rows, canReview, onReview }) {
  if (loading) {
    return <Loader />;
  }
  if (error) {
    return <div className="alert error" role="alert" style={{ margin: 16 }}>{error}</div>;
  }
  if (!rows.length) {
    return <Empty text="No approval records" />;
  }
  return (
    <table>
      <thead>
        <tr>
          <th>Invoice</th>
          <th>Approver</th>
          <th>Sequence</th>
          <th>Status</th>
          <th>Due</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((item) => (
          <tr key={item.id}>
            <td><b>{item.invoice_number}</b></td>
            <td>{item.approver_name}</td>
            <td>{item.sequence}</td>
            <td><Status value={item.status} /></td>
            <td>{item.due_at ? new Date(item.due_at).toLocaleString() : "—"}</td>
            <td>
              {canReview && ["PENDING", "ESCALATED"].includes(item.status) && (
                <button className="link" onClick={() => onReview(item)}>Review</button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RulesTable({ loading, error, rules, approvers, onDelete }) {
  if (loading) {
    return <Loader />;
  }
  if (error) {
    return <div className="alert error" role="alert" style={{ margin: 16 }}>{error}</div>;
  }
  if (!rules.length) {
    return <Empty text="No approval rules configured" />;
  }
  return (
    <table>
      <thead>
        <tr>
          <th>Rule</th>
          <th>Amount range</th>
          <th>Approver</th>
          <th>Sequence</th>
          <th>Mode</th>
          <th>Deadline</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rules.map((item) => (
          <tr key={item.id}>
            <td>{item.name}</td>
            <td>
              {Number(item.min_amount).toLocaleString()} – {Number(item.max_amount).toLocaleString()}
            </td>
            <td>{approvers.find((candidate) => candidate.id === item.role)?.username || `User #${item.role}`}</td>
            <td>{item.sequence}</td>
            <td>{item.parallel ? "Parallel" : "Sequential"}</td>
            <td>{item.escalation_hours}h</td>
            <td>
              <button className="link" onClick={() => onDelete(item.id)}>Delete</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RuleModal({ open, rule, approvers, onChange, onClose, onSubmit }) {
  const field = (name) => (event) => onChange({ ...rule, [name]: event.target.value });
  return (
    <Modal open={open} title="Add approval rule" onClose={onClose}>
      <form className="form-grid" onSubmit={onSubmit}>
        <label className="span-2">
          Rule name
          <input required value={rule.name} onChange={field("name")} />
        </label>
        <label>
          Minimum amount
          <input type="number" min="0" step="0.01" required value={rule.min_amount} onChange={field("min_amount")} />
        </label>
        <label>
          Maximum amount
          <input type="number" min="0" step="0.01" required value={rule.max_amount} onChange={field("max_amount")} />
        </label>
        <label>
          Approver
          <select required value={rule.role} onChange={field("role")}>
            <option value="">Select approver</option>
            {approvers.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>{candidate.username}</option>
            ))}
          </select>
        </label>
        <label>
          Sequence
          <input type="number" min="1" step="1" required value={rule.sequence} onChange={field("sequence")} />
        </label>
        <label>
          Escalation after (hours)
          <input
            type="number"
            min="1"
            step="1"
            required
            value={rule.escalation_hours}
            onChange={field("escalation_hours")}
          />
        </label>
        <label>
          Routing
          <select
            value={rule.parallel ? "parallel" : "sequential"}
            onChange={(event) => onChange({ ...rule, parallel: event.target.value === "parallel" })}
          >
            <option value="sequential">Sequential</option>
            <option value="parallel">Parallel</option>
          </select>
        </label>
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary">Save rule</button>
        </div>
      </form>
    </Modal>
  );
}
