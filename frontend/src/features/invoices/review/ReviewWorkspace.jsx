import React, { useEffect, useMemo, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CircleAlert, ScanLine, Send, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiErrorMessage } from "@/lib/api-errors";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  confirmExtractionReview,
  createInvoice,
  getInvoice,
  getMatchSettings,
  previewOcr,
  submitForApproval,
  updateInvoice,
} from "../api";
import {
  LOCKED_STATUSES,
  SUBMITTABLE_STATUSES,
  canCapture,
  matchPreview,
  statusLabel,
  toApiLine,
  validateReview,
} from "../model";
import { DocumentPreview } from "./DocumentPreview";
import { FieldGroup, ReviewField, fieldLevel } from "./fields";
import { LineItemsEditor } from "./LineItemsEditor";
import { MatchPanel } from "./MatchPanel";
import { createPayload, editedFields, formFromInvoice, formFromOcr, updatePayload } from "./reviewForm";

let toleranceRequest = null;
function loadTolerances() {
  if (!toleranceRequest) {
    toleranceRequest = getMatchSettings().catch((error) => {
      toleranceRequest = null;
      throw error;
    });
  }
  return toleranceRequest;
}

/**
 * The OCR review screen: the source document on the left, extracted fields on the right.
 *   mode "new":      a dropped file -> POST ocr-preview -> review -> POST /invoices/
 *   mode "existing": a captured invoice -> PATCH /invoices/{id}/ (+ review-extraction)
 * "Confirm & submit" also calls submit_approval when validation lets the invoice route.
 */
export function ReviewWorkspace({ target, role, vendors, purchaseOrders, onClose, onCompleted }) {
  const open = Boolean(target);
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        hideClose
        aria-describedby={undefined}
        className={cn(
          "left-0 top-0 flex h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0",
          "overflow-hidden rounded-none border-0 p-0",
          "data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out",
        )}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        {target && (
          <Workspace
            key={target.key}
            target={target}
            role={role}
            vendors={vendors}
            purchaseOrders={purchaseOrders}
            onClose={onClose}
            onCompleted={onCompleted}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function useOcr(target) {
  const [state, setState] = useState(() => (
    target.mode === "new"
      ? { status: "loading", data: null, error: "" }
      : { status: "ready", data: null, error: "" }
  ));
  useEffect(() => {
    if (target.mode !== "new") {
      return undefined;
    }
    let cancelled = false;
    previewOcr(target.file)
      .then((data) => !cancelled && setState({ status: "ready", data, error: "" }))
      .catch((error) => !cancelled && setState({
        status: "failed",
        data: null,
        error: apiErrorMessage(error, { fallback: "OCR couldn't read this file." }),
      }));
    return () => {
      cancelled = true;
    };
  }, [target]);
  return state;
}

function Workspace({ target, role, vendors, purchaseOrders, onClose, onCompleted }) {
  const isNew = target.mode === "new";
  const invoice = target.invoice;
  const ocr = useOcr(target);
  const readOnly = !canCapture(role) || (!isNew && LOCKED_STATUSES.includes(invoice.status));
  const [mobileView, setMobileView] = useState("fields");

  const source = useMemo(() => {
    if (isNew) {
      return { file: target.file, name: target.file.name };
    }
    if (!invoice.file) {
      return null;
    }
    return { url: invoice.file, name: decodeURIComponent(String(invoice.file).split("/").pop() || "Invoice") };
  }, [isNew, target, invoice]);

  const suggestions = isNew ? ocr.data?.fields : invoice.ocr_suggestions;
  const ocrText = isNew ? ocr.data?.text : invoice.ocr_text;
  const wordConfidence = isNew ? ocr.data?.accuracy : invoice.ocr_accuracy;

  return (
    <>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3 sm:px-6">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <DialogTitle className="truncate">
            {isNew ? "Review new invoice" : `Review ${invoice.invoice_number || "invoice"}`}
          </DialogTitle>
          <DialogDescription className="truncate text-xs">
            {isNew ? target.file.name : `${invoice.vendor_name} · ${statusLabel(invoice.status)}`}
          </DialogDescription>
        </div>
        {wordConfidence !== undefined && wordConfidence !== null && ocr.status === "ready" && (
          <Badge variant="neutral" title="Mean Tesseract word confidence for the whole document; not field accuracy.">
            <ScanLine />
            OCR words {formatNumber(wordConfidence, { fractionDigits: 1 })}%
          </Badge>
        )}
        <DialogPrimitive.Close asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Close review">
            <X />
          </Button>
        </DialogPrimitive.Close>
        <div className="flex w-full rounded-lg bg-muted p-1 lg:hidden" role="tablist" aria-label="Review view">
          {["fields", "document"].map((view) => (
            <button
              key={view}
              type="button"
              role="tab"
              aria-selected={mobileView === view}
              onClick={() => setMobileView(view)}
              className={cn(
                "h-8 flex-1 rounded-md text-sm font-medium capitalize outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35",
                mobileView === view ? "bg-card text-foreground shadow-card" : "text-muted-foreground",
              )}
            >
              {view === "fields" ? "Fields" : "Document"}
            </button>
          ))}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-2">
        <DocumentPreview
          source={source}
          ocrText={ocrText}
          className={cn("min-h-0 border-border lg:flex lg:border-r", mobileView === "document" ? "flex" : "hidden")}
        />
        <div className={cn("min-h-0 flex-col lg:flex", mobileView === "fields" ? "flex" : "hidden")}>
          {ocr.status === "loading" ? (
            <OcrLoading />
          ) : (
            <ReviewForm
              target={target}
              isNew={isNew}
              invoice={invoice}
              suggestions={suggestions}
              ocrError={ocr.status === "failed" ? ocr.error : ""}
              readOnly={readOnly}
              role={role}
              vendors={vendors}
              purchaseOrders={purchaseOrders}
              onClose={onClose}
              onCompleted={onCompleted}
            />
          )}
        </div>
      </div>
    </>
  );
}

function OcrLoading() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6" role="status" aria-label="Reading the invoice">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <ScanLine className="size-4 animate-pulse" aria-hidden="true" />
        Reading the invoice with OCR. Multi-page PDFs can take a few seconds.
      </p>
      {[0, 1, 2].map((key) => (
        <div key={key} className="flex flex-col gap-3">
          <Skeleton className="h-4 w-1/4" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ReviewForm({
  target,
  isNew,
  invoice,
  suggestions,
  ocrError,
  readOnly,
  vendors,
  purchaseOrders,
  onClose,
  onCompleted,
}) {
  const initial = useMemo(
    () => (isNew ? formFromOcr(suggestions, vendors.rows) : formFromInvoice(invoice)),
    // Built once per opened target; later vendor reloads must not reset the user's edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [target],
  );
  const [fields, setFields] = useState(initial.fields);
  const [lines, setLines] = useState(initial.lines);
  const [touched, setTouched] = useState({});
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState("");
  const [serverError, setServerError] = useState("");
  const [tolerances, setTolerances] = useState(null);
  const errorRef = useRef(null);

  useEffect(() => {
    loadTolerances().then(setTolerances).catch(() => setTolerances(null));
  }, []);

  const confidence = suggestions?.field_confidence || {};
  const edited = editedFields(fields, suggestions);
  const level = (key, confidenceKey = key) => fieldLevel(confidence[confidenceKey], edited[key]);

  const vendorPOs = purchaseOrders.rows.filter((po) => !fields.vendor || String(po.vendor) === String(fields.vendor));
  const purchaseOrder = purchaseOrders.rows.find((po) => String(po.id) === String(fields.purchase_order)) || null;
  const matching = fields.match_type !== "NONE";

  const validation = validateReview(fields, lines, { requireVendor: isNew });
  const preview = matchPreview({ matchType: fields.match_type, purchaseOrder, lines, fields, tolerances });
  const lineConfidence = confidence.line_items || [];
  const lineLevels = lines.map((line, index) => {
    const entry = index < initial.lines.length && line.key === initial.lines[index].key ? lineConfidence[index] : null;
    return entry ? { level: entry.source === "model" ? "model" : entry.level, confidence: entry } : null;
  });

  const set = (key) => (value) => {
    setFields((current) => ({ ...current, [key]: value }));
    setTouched((current) => ({ ...current, [key]: true }));
  };
  const errorFor = (key) => ((touched[key] || showAllErrors) ? validation.errors[key] : "");

  const onPurchaseOrderChange = (id) => {
    set("purchase_order")(id);
    const po = purchaseOrders.rows.find((item) => String(item.id) === String(id));
    if (!po) {
      return;
    }
    // Link unlinked lines to the PO line with the same description.
    setLines((current) => current.map((line) => {
      if (line.po_line) {
        return line;
      }
      const match = (po.lines || []).find((poLine) => (
        poLine.description.trim().toLowerCase() === line.description.trim().toLowerCase()
      ));
      return match ? { ...line, po_line: String(match.id) } : line;
    }));
  };

  const saveBlocked = Object.keys(validation.errors).length > 0
    || !lines.length
    || validation.lineErrors.some((item) => Object.keys(item).length);
  const submitBlocked = !validation.ok || !confirmed;

  const save = async (submit) => {
    setSaving(submit ? "submit" : "save");
    setServerError("");
    try {
      const apiLines = lines.map(toApiLine);
      let id;
      if (isNew) {
        const created = await createInvoice({
          fields: createPayload(fields),
          lines: apiLines,
          file: target.file,
          reviewed: confirmed,
        });
        id = created.id;
      } else {
        id = invoice.id;
        await updateInvoice(id, updatePayload(fields), apiLines);
        if (confirmed) {
          await confirmExtractionReview(id);
        }
      }
      const saved = await getInvoice(id);
      let submitted = false;
      let submitError = "";
      if (submit) {
        if (SUBMITTABLE_STATUSES.includes(saved.status)) {
          try {
            await submitForApproval(id);
            submitted = true;
          } catch (error) {
            submitError = apiErrorMessage(error, { fallback: "It couldn't be submitted for approval." });
          }
        } else {
          const count = saved.exceptions?.length || 0;
          submitError = count
            ? `It has ${count} validation exception${count === 1 ? "" : "s"} to resolve first.`
            : `Its status is ${statusLabel(saved.status)}.`;
        }
      }
      onCompleted(saved, { created: isNew, submitted, submitError, submitRequested: submit });
    } catch (error) {
      setServerError(apiErrorMessage(error, {
        fallback: isNew ? "The invoice couldn't be captured." : "The corrections couldn't be saved.",
        forbidden: "Your role can't capture or edit invoices.",
      }));
      setSaving("");
      window.requestAnimationFrame(() => errorRef.current?.focus());
    }
  };

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {serverError && (
          <div
            ref={errorRef}
            tabIndex={-1}
            role="alert"
            className="m-4 flex gap-2 rounded-md border border-danger-border bg-danger-subtle px-4 py-3 text-sm text-danger-subtle-foreground outline-none sm:mx-6"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{serverError}</span>
          </div>
        )}
        {ocrError && (
          <div
            role="status"
            className="m-4 flex gap-2 rounded-md border border-warning-border bg-warning-subtle px-4 py-3 text-sm text-warning-subtle-foreground sm:mx-6"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{ocrError} Enter the fields from the document; the file is still attached on save.</span>
          </div>
        )}
        {!isNew && invoice.exceptions?.length > 0 && (
          <ExceptionList exceptions={invoice.exceptions} />
        )}

        <FieldGroup title="Vendor" description="Who issued the invoice.">
          <div className="grid gap-4 sm:grid-cols-2">
            <ReviewField
              id="review-vendor"
              label="Vendor"
              required={isNew}
              level={isNew && !fields.vendor ? "missing" : null}
              error={errorFor("vendor")}
              hint={vendorHint(isNew, initial.vendorMatchedByGstin, fields.vendor)}
            >
              {isNew ? (
                <VendorSelect vendors={vendors} value={fields.vendor} onChange={set("vendor")} disabled={readOnly} />
              ) : (
                <Input id="review-vendor" value={invoice.vendor_name || ""} disabled />
              )}
            </ReviewField>
            <ReviewField
              id="review-gstin"
              label="Vendor GSTIN"
              level={level("extracted_gstin", "gstin")}
              confidence={confidence.gstin}
              error={errorFor("extracted_gstin")}
            >
              <Input
                id="review-gstin"
                value={fields.extracted_gstin}
                disabled={readOnly}
                maxLength={15}
                placeholder="15-character GSTIN"
                aria-invalid={Boolean(errorFor("extracted_gstin")) || undefined}
                onChange={(event) => set("extracted_gstin")(event.target.value.toUpperCase())}
                className="font-mono uppercase"
              />
            </ReviewField>
          </div>
        </FieldGroup>

        <FieldGroup title="Invoice details">
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField id="invoice_number" label="Invoice number" required {...fieldProps("invoice_number")} />
            <TextField id="invoice_date" label="Invoice date" type="date" required {...fieldProps("invoice_date")} />
            <TextField id="due_date" label="Due date" type="date" required {...fieldProps("due_date")} />
          </div>
        </FieldGroup>

        <FieldGroup title="Amounts" description="In INR, as printed on the invoice.">
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField id="subtotal" label="Subtotal" type="number" required numeric {...fieldProps("subtotal")} />
            <TextField id="tax_amount" label="Tax" type="number" required numeric {...fieldProps("tax_amount")} />
            <TextField id="total_amount" label="Total" type="number" required numeric {...fieldProps("total_amount")} />
          </div>
        </FieldGroup>

        <FieldGroup title="Line items" description="Amount = quantity × unit price.">
          <LineItemsEditor
            lines={lines}
            onChange={setLines}
            lineErrors={validation.lineErrors}
            lineLevels={lineLevels}
            matching={matching}
            poLines={purchaseOrder?.lines || []}
            check={validation.check}
            readOnly={readOnly}
            showErrors
          />
        </FieldGroup>

        <FieldGroup title="Matching" description="Compare the invoice with its purchase order before routing it.">
          <MatchPanel
            matchType={fields.match_type}
            onMatchTypeChange={set("match_type")}
            purchaseOrder={purchaseOrder}
            purchaseOrders={vendorPOs}
            onPurchaseOrderChange={onPurchaseOrderChange}
            purchaseOrdersState={purchaseOrders}
            preview={preview}
            poError={errorFor("purchase_order")}
            readOnly={readOnly}
          />
        </FieldGroup>
      </div>

      <ReviewFooter
        readOnly={readOnly}
        isNew={isNew}
        invoice={invoice}
        validation={validation}
        confirmed={confirmed}
        onConfirmedChange={setConfirmed}
        saving={saving}
        saveBlocked={saveBlocked}
        submitBlocked={submitBlocked}
        onShowProblems={() => setShowAllErrors(true)}
        onSave={() => save(false)}
        onSubmit={() => save(true)}
        onClose={onClose}
      />
    </>
  );

  function fieldProps(key) {
    return {
      value: fields[key],
      onChange: set(key),
      level: level(key),
      confidence: confidence[key],
      error: errorFor(key),
      readOnly,
    };
  }
}

function vendorHint(isNew, matchedByGstin, vendor) {
  if (!isNew) {
    return "The vendor of a captured invoice can't be changed here.";
  }
  if (matchedByGstin && vendor) {
    return "Matched from the GSTIN on the invoice.";
  }
  return "OCR doesn't read vendor names; choose the vendor.";
}

function VendorSelect({ vendors, value, onChange, disabled }) {
  return (
    <>
      <Select value={value || undefined} onValueChange={onChange} disabled={disabled || vendors.loading || Boolean(vendors.error)}>
        <SelectTrigger id="review-vendor">
          <SelectValue placeholder={vendors.loading ? "Loading vendors…" : "Choose a vendor"} />
        </SelectTrigger>
        <SelectContent>
          {vendors.rows.map((vendor) => (
            <SelectItem key={vendor.id} value={String(vendor.id)}>
              {vendor.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {vendors.error && (
        <p role="alert" className="text-xs text-danger">
          {vendors.error}{" "}
          <button type="button" className="font-medium underline" onClick={vendors.reload}>
            Retry
          </button>
        </p>
      )}
    </>
  );
}

function TextField({ id, label, type = "text", required, numeric, value, onChange, level, confidence, error, readOnly }) {
  const inputId = `review-${id}`;
  return (
    <ReviewField id={inputId} label={label} required={required} level={level} confidence={confidence} error={error}>
      <Input
        id={inputId}
        type={type}
        value={value}
        disabled={readOnly}
        step={numeric ? "0.01" : undefined}
        min={numeric ? "0" : undefined}
        inputMode={numeric ? "decimal" : undefined}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? `${inputId}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={cn(numeric && "text-right tabular-nums")}
      />
    </ReviewField>
  );
}

function ExceptionList({ exceptions }) {
  return (
    <div role="status" className="m-4 flex flex-col gap-2 rounded-md border border-danger-border bg-danger-subtle px-4 py-3 sm:mx-6">
      <p className="flex items-center gap-2 text-sm font-medium text-danger-subtle-foreground">
        <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
        Current validation exceptions
      </p>
      <ul className="flex list-disc flex-col gap-1 pl-10 text-sm text-danger-subtle-foreground">
        {exceptions.map((exception) => (
          <li key={exception}>{exception}</li>
        ))}
      </ul>
    </div>
  );
}

function ReviewFooter({
  readOnly,
  isNew,
  invoice,
  validation,
  confirmed,
  onConfirmedChange,
  saving,
  saveBlocked,
  submitBlocked,
  onShowProblems,
  onSave,
  onSubmit,
  onClose,
}) {
  if (readOnly) {
    return (
      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-border px-4 py-3 sm:px-6">
        <p className="text-sm text-muted-foreground">
          {invoice && LOCKED_STATUSES.includes(invoice.status)
            ? `This invoice is ${statusLabel(invoice.status).toLowerCase()} and can no longer be edited.`
            : "Read-only: your role can view the extraction but not change it."}
        </p>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </footer>
    );
  }

  const problems = [...Object.values(validation.errors), ...validation.blocking];
  return (
    <footer className="flex flex-col gap-3 border-t border-border bg-card px-4 py-3 sm:px-6">
      {problems.length > 0 ? (
        <details className="text-sm" onToggle={(event) => event.currentTarget.open && onShowProblems()}>
          <summary className="cursor-pointer text-danger">
            {problems.length} thing{problems.length === 1 ? "" : "s"} to fix before submitting
          </summary>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-6 text-muted-foreground">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </details>
      ) : (
        <p className="text-sm text-success">All required fields are valid and the totals add up.</p>
      )}
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => onConfirmedChange(event.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-primary"
        />
        I checked these fields and line items against the source document.
      </label>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onClose} disabled={Boolean(saving)}>
          Cancel
        </Button>
        <Button
          variant="outline"
          onClick={onSave}
          loading={saving === "save"}
          disabled={Boolean(saving) || saveBlocked}
        >
          {isNew ? "Save without submitting" : "Save corrections"}
        </Button>
        <Button
          onClick={onSubmit}
          loading={saving === "submit"}
          disabled={Boolean(saving) || submitBlocked}
        >
          {saving !== "submit" && <Send />}
          Confirm &amp; submit
        </Button>
      </div>
    </footer>
  );
}
