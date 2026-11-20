/*
 * Signs each test user in once through the API (login is rate-limited per IP) and saves the
 * session as Playwright storage state. Also creates the PO + goods receipt the sample invoice
 * (docs/assets/sample-invoice.png, "PO-3WAY-DEMO-001", 2 × A4 paper @ ₹50) is matched against.
 */
import fs from "node:fs";
import { expect, test as setup } from "@playwright/test";
import { API_URL, AUTH_DIR, BASE_URL, USERS, storageFor } from "./helpers.js";

async function login(request, { username, password }) {
  const response = await request.post(`${API_URL}/auth/login/`, { data: { username, password } });
  expect(response.ok(), `login ${username}: ${response.status()} ${await response.text()}`).toBeTruthy();
  return response.json();
}

function saveSession(name, session) {
  const state = {
    cookies: [],
    origins: [{
      origin: BASE_URL,
      localStorage: [
        { name: "access", value: session.access },
        { name: "refresh", value: session.refresh },
        { name: "user", value: JSON.stringify(session.user) },
      ],
    }],
  };
  fs.writeFileSync(storageFor(name), JSON.stringify(state, null, 2));
}

async function call(request, token, method, path, data) {
  const response = await request.fetch(`${API_URL}${path}`, {
    method,
    data,
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok(), `${method} ${path}: ${response.status()} ${await response.text()}`).toBeTruthy();
  return response.json();
}

setup("sign in test users and seed matching data", async ({ request }) => {
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const admin = await login(request, USERS.admin);
  saveSession("admin", admin);
  saveSession("approver", await login(request, USERS.approver));

  const token = admin.access;
  const createEmployee = async (name, password) => {
    const user = USERS[name];
    const created = await call(request, token, "POST", "/employees/", {
      username: user.username,
      email: user.email,
      first_name: "E2E",
      last_name: name,
      role: user.role,
      password,
    });
    await call(request, token, "PATCH", `/employees/${created.id}/activation/`, { is_active: true });
  };

  // Admin-created accounts must replace the issued password before the API serves them.
  for (const name of ["shots", "audit"]) {
    const user = USERS[name];
    const issued = `issued-${user.password}`;
    await createEmployee(name, issued);
    const first = await login(request, { username: user.username, password: issued });
    expect(first.user.must_change_password).toBe(true);
    const changed = await call(request, first.access, "POST", "/auth/change-password/", {
      current_password: issued,
      new_password: user.password,
    });
    saveSession(name, changed);
  }
  await createEmployee("newhire", USERS.newhire.password);

  const vendors = await call(request, token, "GET", "/vendors/?search=VEND-001");
  const vendor = (vendors.results || vendors)[0];
  const today = new Date().toISOString().slice(0, 10);
  const po = await call(request, token, "POST", "/purchase-orders/", {
    number: "PO-3WAY-DEMO-001",
    vendor: vendor.id,
    order_date: today,
    status: "OPEN",
    // PO totals include tax: 2 × ₹50 + ₹18 GST.
    total_amount: "118.00",
    lines: [{ description: "A4 paper", quantity: "2", unit_price: "50.00" }],
  });
  await call(request, token, "POST", "/grns/", {
    number: "GRN-E2E-001",
    purchase_order: po.id,
    received_date: today,
    received_by: admin.user.id,
    notes: "Seeded by the e2e setup",
    lines: [{ po_line: po.lines[0].id, quantity: "2" }],
  });
  // A second PO with partial receipt so the progress bars have something to show.
  const po2 = await call(request, token, "POST", "/purchase-orders/", {
    number: "PO-E2E-002",
    vendor: vendor.id,
    order_date: today,
    status: "OPEN",
    total_amount: "4500.00",
    lines: [
      { description: "Toner cartridge", quantity: "3", unit_price: "1200.00" },
      { description: "Stapler", quantity: "6", unit_price: "150.00" },
    ],
  });
  await call(request, token, "POST", "/grns/", {
    number: "GRN-E2E-002",
    purchase_order: po2.id,
    received_date: today,
    received_by: admin.user.id,
    notes: "",
    lines: [{ po_line: po2.lines[0].id, quantity: "1" }],
  });
});
