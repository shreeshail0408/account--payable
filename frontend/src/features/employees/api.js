/* Employee accounts (ADMIN only; unchanged endpoints). GET returns a plain list. */
import api from "@/services/api";

export const listEmployees = () => api.get("/employees/").then(({ data }) => data.results || data);
export const createEmployee = (body) => api.post("/employees/", body).then(({ data }) => data);
export const setEmployeeActive = (id, isActive) => (
  api.patch(`/employees/${id}/activation/`, { is_active: isActive }).then(({ data }) => data)
);
/** POST employees/{id}/reset-password/ -> {temporary_password, employee}. Shown to the admin once. */
export const resetEmployeePassword = (id) => (
  api.post(`/employees/${id}/reset-password/`).then(({ data }) => data)
);
