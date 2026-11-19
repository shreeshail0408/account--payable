/* Approval queue and rule API calls (unchanged endpoints; approval rows gained read-only
   vendor_name / invoice_total_amount / invoice_due_date / invoice_status fields). */
import api from "@/services/api";
import { fetchAllPages } from "@/lib/pagination";

export const listAllApprovals = () => fetchAllPages("/approvals/");
export const listReminders = () => api.get("/approvals/reminders/").then(({ data }) => data);
export const approveStep = (id, comments) => api.post(`/approvals/${id}/approve/`, { comments }).then(({ data }) => data);
export const rejectStep = (id, comments) => api.post(`/approvals/${id}/reject/`, { comments }).then(({ data }) => data);
export const escalateOverdue = () => api.post("/approvals/escalate-overdue/").then(({ data }) => data);

export const listRules = () => api.get("/approval-rules/").then(({ data }) => data.results || data);
export const listApprovers = () => api.get("/approval-rules/approvers/").then(({ data }) => data);
export const createRule = (body) => api.post("/approval-rules/", body).then(({ data }) => data);
export const deleteRule = (id) => api.delete(`/approval-rules/${id}/`);
