import axios from "axios";

// Production builds set VITE_API_URL. In local dev the default is same-origin "/api", which the Vite
// dev server proxies to Django (vite.config.js), so phones on the same Wi-Fi work too.
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });
let refreshRequest = null;

/** The server requires a new password (new account or admin reset): show the change-password screen. */
function holdForPasswordChange() {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "null");
    if (user && !user.must_change_password) {
      localStorage.setItem("user", JSON.stringify({ ...user, must_change_password: true }));
    }
  } catch {
    // Unreadable stored user: the route guard falls back to the sign-in page.
  }
  if (!window.location.pathname.endsWith("/change-password")) {
    window.location.href = `${import.meta.env.BASE_URL}change-password`;
  }
}
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 403 && error.response.data?.code === "password_change_required") {
      holdForPasswordChange();
      return Promise.reject(error);
    }
    if (error.response?.status === 401) {
      const request = error.config;
      const authPath = request?.url?.includes("/auth/login/") || request?.url?.includes("/auth/refresh/");
      const refresh = localStorage.getItem("refresh");
      if (request && !request._retry && !authPath && refresh) {
        request._retry = true;
        try {
          if (!refreshRequest) {
            refreshRequest = axios.post(`${api.defaults.baseURL}/auth/refresh/`, { refresh })
              .then(({data}) => {
                localStorage.setItem("access", data.access);
                if (data.refresh) localStorage.setItem("refresh", data.refresh);
                return data.access;
              }).finally(() => { refreshRequest = null; });
          }
          const access = await refreshRequest;
          request.headers = request.headers || {};
          request.headers.Authorization = `Bearer ${access}`;
          return api(request);
        } catch (_) {
          // Clear the expired session below if token rotation fails.
        }
      }
      localStorage.removeItem("access");
      localStorage.removeItem("user");
      localStorage.removeItem("refresh");
      if (!window.location.pathname.includes("/login")) window.location.href = `${import.meta.env.BASE_URL}login`;
    }
    return Promise.reject(error);
  }
);
export default api;
