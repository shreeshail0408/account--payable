# PayFlow AP – User Guide

How to use the app, role by role, with one worked example that takes a real invoice from upload to payment.

- Local app: <http://localhost:5173> (on a phone on the same Wi-Fi: `http://<your-PC-IP>:5173`)
- Public app: <https://shreeshail0408.github.io/account--payable/>

## 1. The idea in one minute

A supplier (vendor) sends your company an invoice. PayFlow AP takes it through these steps:

```
Vendor ──► Purchase order ──► Goods received ──► Invoice captured (OCR) ──► Approved ──► Paid
          (what we ordered)  (what arrived)     (what they billed)         (manager OK)  (accounts)
```

Before an invoice can be paid, the app checks that what was **ordered** (PO), what was **received** (GRN) and what was
**billed** (invoice) agree. This is called **3-way matching**. Each step is done by a different person (role), so
nobody can order, approve and pay on their own.

## 2. The five roles

| Role | Typical person | What they do | Menu items they see |
|---|---|---|---|
| **Administrator** | IT / finance head | Creates accounts, sets approval rules, approves new vendors, manages bank details. Can do everything. | All |
| **AP Clerk** | Accounts-payable staff | Adds vendors, creates purchase orders and goods receipts, uploads and checks invoices, sends them for approval. | Dashboard, Invoices, Purchase Orders, Goods Receipts, Vendors |
| **Approver** | Department manager | Approves or rejects invoices assigned to them, on desktop or phone. | Dashboard, Invoices, Approvals |
| **Accountant** | Finance / payments | Creates payment requests, records payments, verifies vendor GSTIN, runs reports. | Dashboard, Invoices, Payments, Reports, Vendors |
| **Auditor** | Internal / external audit | Read-only: sees everything and the full audit trail, exports reports. Can't change anything. | Everything except Employees, all read-only |

The server enforces these permissions, so hiding a button isn't the only protection. Someone who tries an action
their role doesn't allow gets "Your role doesn't allow this".

## 3. Before you start: create one account per role

Your local app has `admin` (Administrator), `approver` (Approver) and `nitin` (AP Clerk). Create the two missing
roles:

1. Sign in as **admin**.
2. Open **Employees** → **Add employee**.
3. Create the **Accountant**:
   - Username `priya_accounts`
   - Email `priya@example.com`
   - Role **Accountant**
   - Temporary password `Welcome-Priya-2026`
   - Click **Save**
4. Create the **Auditor** the same way:
   - Username `ravi_audit`
   - Email `ravi@example.com`
   - Role **Auditor**
   - Temporary password `Welcome-Ravi-2026`
5. New accounts start **Inactive**. Click **Activate** on each one.
6. The first time each person signs in, they're asked to **choose their own password**. This is expected: it means
   the admin never knows anyone's real password.

**Tip:** to use two roles at the same time, sign in as one in a normal window and the other in a private/incognito
window. Each window keeps its own sign-in.

## 4. Worked example: one invoice, start to finish

**Scenario:** your company orders 2 reams of A4 paper at ₹50 each from **Acme Supplies**, which comes to ₹100 plus
₹18 GST, so ₹118 in total. The paper arrives, Acme sends invoice `SAMPLE-INV-001`, and it gets approved and paid.

The invoice file is in the project at **`docs/assets/sample-invoice.png`**. It's a demo document, not a real tax
invoice.

### Step 1: Administrator checks the setup (sign in as `admin`)

1. **Vendors**: *Acme Supplies* (`VEND-001`, GSTIN `29ABCDE1234F1Z5`) should show **Active**. Click it to see the
   tabs:
   - **Profile**
   - **Bank**: masked; **Reveal** shows the full number and is recorded in the audit log
   - **GSTIN**
   - **Invoices**
   - **Onboarding**
2. **Approvals** → scroll to **Approval matrix**. The rule *Standard approval* sends invoices from ₹0 to ₹1,00,000 to
   `approver`. Without a matching rule, invoices can't be sent for approval.
   - To try a two-step approval, click **Add rule**: from ₹50,000, up to ₹10,00,000, approver `approver`, step 2.

### Step 2: AP Clerk creates the purchase order (sign in as `nitin`)

1. Open **Purchase Orders** → **Create purchase order**.
2. Fill in:
   - **PO number**: `PO-3WAY-DEMO-001` (the sample invoice mentions this number)
   - **Vendor**: Acme Supplies
   - **Order date**: today
3. Under **Lines**, add one line:
   - Description `A4 paper`
   - Quantity `2`
   - Unit price `50`
4. Set **PO total** to `118` (₹100 plus ₹18 GST), then save.

### Step 3: AP Clerk records what arrived (still `nitin`)

1. Open the PO you just created → **Record goods receipt**.
2. Fill in:
   - **GRN number**: `GRN-001`
   - **Received on**: today
3. Click **Fill remaining quantities**. This sets the quantity for A4 paper to 2.
4. Save. On the PO list, the **Received** column now shows 2 / 2.

### Step 4: AP Clerk captures the invoice (still `nitin`)

1. Open **Invoices** → **Capture invoices**.
2. Drop **`docs/assets/sample-invoice.png`** into the box.
   - One file opens the **review screen**.
   - Several files at once are processed as a batch, with progress for each file.
3. **Review screen.** The document is on the left; the fields OCR read from it are on the right.
   - Each field has a **High / Medium / Low** marker showing how sure the OCR is. Check the Low ones first.
   - The vendor was recognized from the GSTIN printed on the invoice.
4. **Line items:** OCR usually misses them on this sample. Add the line by hand:
   - Description `A4 paper`
   - Quantity `2`
   - Unit price `50`

   The totals check turns green when lines = subtotal and subtotal + tax = total.
5. **Matching:** choose **3-way**, then pick `PO-3WAY-DEMO-001`. The preview shows ordered 2, received 2,
   invoiced 2, which is a match.
6. Tick **"I checked these fields…"** → **Confirm & submit**.
7. A message confirms it was **sent for approval**. In the Invoices list the status is **Pending approval**.

Click the invoice row to open its detail panel. It shows:
- **Approval steps**: who must approve, and the deadline
- **Line match**
- **Exceptions**: anything that didn't match
- **Audit timeline**

### Step 5: Approver approves (sign in as `approver`)

1. The **Approvals** menu item shows a badge with the number of invoices waiting.
2. Open **Approvals** → **To decide** tab. Click the invoice to preview it, with its amount, vendor, line match and
   exceptions.
3. Click **Approve**, optionally adding a comment.
   - **Reject** requires a reason. The clerk sees the invoice as **Rejected**, with your reason.
4. **On a phone:** open the app on the phone and sign in as `approver`. Each invoice is a card with large
   **Approve / Reject** buttons, and **View invoice details** opens the full summary.

The invoice status becomes **Approved**. With a two-step rule, it goes to the next approver first.

### Step 6: Accountant pays (sign in as `priya_accounts`)

1. Open **Payments** → **Generate payment request**.
2. Choose the approved invoice (`SAMPLE-INV-001`, ₹118) and a **payment method**, then create the request. It
   appears in **Requested**.
3. Open the payment.
   - Because no bank is connected, the page shows **"Demo mode – no real money transfer"**.
   - Click **Record demo payment** and enter a **Bank reference**, for example `UTR-TEST-0001`. This only updates
     PayFlow's records; **no money moves**.
4. The payment moves to **Paid**, and the invoice status becomes **Paid**.
5. **Download advice** gives the payment advice document you'd send to the vendor.

### Step 7: Auditor reviews (sign in as `ravi_audit`)

1. Open **Invoices** → click `SAMPLE-INV-001`. The **audit timeline** shows every step: who uploaded, matched,
   approved and paid it, and when.
2. Try to change anything. There are no edit buttons, and the server would refuse anyway, because Auditor is
   read-only.
3. Open **Reports**:
   - **Audit log**: also shows sign-ins and password changes
   - **AP aging**
   - **Invoice status**
   - **Exceptions**
   - **GST/tax**

   Pick one, filter by vendor or date, check the preview, then **Export CSV** to open it in Excel.
4. **Dashboard**: outstanding amounts, an aging chart (how overdue invoices are) and invoices by stage.

## 5. More things to try

| Try this | As | What you should see |
|---|---|---|
| Upload `sample-invoice.png` **again** | AP Clerk | A **duplicate** warning: the same file or invoice number can't be paid twice. |
| Change the invoice total to `150` on the review screen | AP Clerk | The totals check fails and matching shows an amount exception. Fix it, or submit with the exception visible to the approver. |
| **Reject** an invoice with a reason | Approver | The status becomes **Rejected**; the reason appears in the invoice's detail panel. |
| Add a new vendor | AP Clerk | It starts as **Pending onboarding**. The admin approves it in the vendor panel (**Approve and activate**). |
| Open **Payments** | Approver | Not in the menu; typing the address sends you back to the dashboard. |
| Sign in with a wrong password 5 times | anyone | The account is **locked for 15 minutes**. An admin **Reset password** unlocks it immediately. |
| **Reset password** for `nitin` | Admin | A one-time temporary password appears. Nitin must choose a new one at next sign-in. |
| Account menu → **Change password** | anyone | Changes your password; your other devices are signed out. |
| **Ctrl + K** (⌘K on Mac) | anyone | Quick search for pages, invoices, vendors and POs. |
| Account menu → **Dark** | anyone | Dark theme, which is remembered on that device. |

## 5a. Test invoices for OCR

Demo files in **`docs/assets/test-invoices/`**, all from *Acme Supplies* (GSTIN `29ABCDE1234F1Z5`). Each has its own
invoice number, so none is rejected as a duplicate.

| File | Format | Total | What OCR reads |
|---|---|---|---|
| `INV-TEST-101.pdf` | PDF | ₹4,720.00 | All fields and 3 line items |
| `INV-TEST-102-phone-photo.jpg` | JPEG phone photo (tilted, slightly blurred) | ₹3,599.00 | All fields and totals; add the 2 line items by hand |
| `INV-TEST-103.png` | PNG | ₹10,620.00 | All fields and 1 line item |
| `../sample-invoice.png` | PNG | ₹118.00 | All fields; add the line item by hand |

Before uploading, make sure the vendor **Acme Supplies** exists with GSTIN `29ABCDE1234F1Z5` (Vendors → Add vendor,
then an admin approves it); the invoice is matched to the vendor by GSTIN. To match against a PO, use 2-way matching
with `PO-2026-001` or create a PO with the same lines.

Line items are read when each row is on one line (*description, quantity, rate, amount*). Photos and widely spaced
tables often split into columns, so check the line items on the review screen.

## 6. Invoice statuses explained

| Status | Meaning | Who acts next |
|---|---|---|
| Captured | Uploaded, not yet checked | AP Clerk reviews it |
| Validation failed | Required fields are missing or wrong (e.g. totals don't add up) | AP Clerk fixes it |
| Match pending / Matched | Comparison with PO and GRN is running or OK | AP Clerk submits it |
| Exception | Something doesn't match (quantity, price, amount) | AP Clerk fixes it or the approver decides |
| Pending approval | Waiting for an approver | Approver |
| Approved | All approval steps done | Accountant pays |
| Rejected | An approver said no (the reason is in the detail panel) | AP Clerk follows up with the vendor |
| Paid | A payment was recorded | Nobody: done |

## 7. Common problems

| Message | What to do |
|---|---|
| "Can't reach the server" | The backend isn't running, or the free public server is restarting. Wait a minute and retry. Locally, start `python3 manage.py runserver 0.0.0.0:8000` in `backend/`. |
| "Incorrect username or password, or your account hasn't been activated yet" | Check spelling (it's case-sensitive). New accounts must be **activated** by an admin. |
| "Too many failed sign-in attempts for this account" | Wait 15 minutes, or ask an admin to **Reset password**. |
| A "Choose a new password" screen after signing in | Your admin set the password. Enter it as the temporary password and pick your own. |
| "Your role doesn't allow this" | That action belongs to another role (see section 2). |
| Can't send an invoice for approval | No approval rule covers its amount. An admin adds one in **Approvals → Approval matrix**. |

## 8. Good to know

- **Payments are demo records only.** No bank, ERP or GST service is connected, and the app says so wherever it
  matters.
- **On the public site** (free hosting): the first request after idle time can take up to a minute, uploaded files
  are lost when the server restarts, and the free database expires after 30 days. Use it for demos, not real
  invoices.
- **Vendors don't have logins.** Your staff do all vendor work in the app.
