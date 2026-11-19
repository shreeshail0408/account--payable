/* Employee accounts (ADMIN only; unchanged endpoints). GET returns a plain list. */
import api from "@/services/api";

export const listEmployees = () => api.get("/employees/").then(({ data }) => data.results || data);
export const createEmployee = (body) => api.post("/employees/", body).then(({ data }) => data);
export const setEmployeeActive = (id, isActive) => (
  api.patch(`/employees/${id}/activation/`, { is_active: isActive }).then(({ data }) => data)
);
