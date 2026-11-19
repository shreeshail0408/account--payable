import axios from "axios";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000/api" });
let refreshRequest = null;
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
api.interceptors.response.use(
  (response) => response,
  async (error) => {
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
      if (!window.location.pathname.includes("/login")) window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);
export default api;
