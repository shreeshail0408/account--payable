/* Purchase order and goods receipt API calls (unchanged endpoints). */
import api from "@/services/api";

export const listPurchaseOrders = (params) => api.get("/purchase-orders/", { params }).then(({ data }) => data);
export const createPurchaseOrder = (body) => api.post("/purchase-orders/", body).then(({ data }) => data);
export const listGoodsReceipts = (params) => api.get("/grns/", { params }).then(({ data }) => data);
export const createGoodsReceipt = (body) => api.post("/grns/", body).then(({ data }) => data);
