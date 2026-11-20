import axios from "axios";

// Production builds set VITE_API_URL. In local dev the default is same-origin "/api", which the Vite
// dev server proxies to Django (vite.config.js), so phones on the same Wi-Fi work too.
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });
let refreshRequest = null;

// Hosted free-tier servers restart now and then (deploys, idle wake-ups). Their proxy answers 502/503
// without CORS headers, which the browser reports as a network error. Safe (GET) requests retry a
// couple of times before the page shows an error.
const RETRY_DELAYS_MS = [2000, 5000];
const RETRYABLE_STATUS = new Set([502, 503, 504]);

function shouldRetry(error) {
  const config = error.config;
  if (!config || (config.method || "get").toLowerCase() !== "get") {
    return false;
  }
  if ((config._retryCount || 0) >= RETRY_DELAYS_MS.length) {
    return false;
  }
  return !error.response || RETRYABLE_STATUS.has(error.response.status);
}

function retryLater(error) {
  const config = error.config;
  const delay = RETRY_DELAYS_MS[config._retryCount || 0];
  config._retryCount = (config._retryCount || 0) + 1;
  return new Promise((resolve) => setTimeout(resolve, delay)).then(() => api(config));
}

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
    if (axios.isCancel(error)) {
      return Promise.reject(error);
    }
    if (shouldRetry(error)) {
      return retryLater(error);
    }
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
