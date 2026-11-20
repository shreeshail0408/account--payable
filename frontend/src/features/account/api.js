/* The signed-in user's own account. */
import api from "@/services/api";

/** POST auth/change-password/ -> {detail, access, refresh, user}; other sessions are signed out. */
export const changePassword = (body) => api.post("/auth/change-password/", body).then(({ data }) => data);
