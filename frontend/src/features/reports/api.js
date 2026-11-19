/* GET /reports/?kind=… returns CSV (unchanged). The preview reads it as text. */
import api from "@/services/api";

/** Errors arrive as text too; parse JSON bodies so apiErrorMessage can show DRF messages. */
function normalizeError(error) {
  const data = error?.response?.data;
  if (typeof data === "string") {
    try {
      error.response.data = JSON.parse(data);
    } catch {
      // Not JSON (e.g. an HTML 502 page): leave it; apiErrorMessage handles 5xx by status.
    }
  }
  throw error;
}

export function fetchReportCsv(params) {
  return api
    .get("/reports/", { params, responseType: "text", transformResponse: [(data) => data] })
    .then(({ data }) => data)
    .catch(normalizeError);
}

export const getIntegrationStatus = () => api.get("/integrations/status/").then(({ data }) => data);
export const listIntegrationDeliveries = () => (
  api.get("/integration-deliveries/").then(({ data }) => data.results || data)
);
