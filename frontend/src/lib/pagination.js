import api from "@/services/api";

/*
 * Follow `next` links of a paginated DRF list (PAGE_SIZE 20). Used for dropdown sources,
 * CSV exports and small queues that are filtered on the client. `truncated` is true when
 * `maxPages` stopped the walk before the last page.
 */
export async function fetchAllPages(path, params = {}, { maxPages = 50 } = {}) {
  const rows = [];
  let page = 1;
  for (;;) {
    const { data } = await api.get(path, { params: { ...params, page } });
    const results = data.results || data;
    rows.push(...results);
    if (!data.next || !Array.isArray(data.results) || page >= maxPages) {
      return { rows, truncated: Boolean(data.next) };
    }
    page += 1;
  }
}

/** Rows of a list response, paginated (`{results}`) or not (plain array). */
export function rowsOf(data) {
  return data?.results || data || [];
}
