import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  CircleCheck,
  CircleX,
  FileImage,
  FileText,
  LoaderCircle,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { apiErrorMessage } from "@/lib/api-errors";
import { cn } from "@/lib/utils";
import { bulkUpload } from "./api";
import { ACCEPT_ATTRIBUTE, checkBatch, checkFile, fileKind, formatBytes } from "./model";

let fileCounter = 0;

function toEntries(fileList) {
  return Array.from(fileList).map((file) => {
    fileCounter += 1;
    return { id: `file-${fileCounter}`, file, error: checkFile(file), state: "queued", progress: 0, detail: "" };
  });
}

/**
 * One drop zone for every capture: a single file opens the OCR review screen, several files
 * go to POST /invoices/bulk/ one file per request so each row shows its own progress and result.
 */
export function UploadDialog({ open, onOpenChange, onSingleFile, onBatchFinished, vendors }) {
  const [entries, setEntries] = useState([]);
  const [vendor, setVendor] = useState("");
  const [running, setRunning] = useState(false);
  const cancelled = useRef(false);

  useEffect(() => {
    if (!open) {
      setEntries([]);
      setRunning(false);
    }
  }, [open]);

  const addFiles = useCallback((fileList) => {
    const added = toEntries(fileList);
    if (!added.length) {
      return;
    }
    // A single valid file with nothing else queued is a normal capture: go straight to review.
    if (!entries.length && added.length === 1) {
      if (added[0].error) {
        toast.error(`${added[0].file.name}: ${added[0].error}`);
        return;
      }
      onSingleFile(added[0].file);
      return;
    }
    setEntries((current) => [...current, ...added]);
  }, [entries.length, onSingleFile]);

  const valid = entries.filter((entry) => !entry.error);
  const pending = valid.filter((entry) => entry.state === "queued" || entry.state === "failed");
  const batchError = checkBatch(pending.map((entry) => entry.file));
  const finished = entries.length > 0 && valid.length > 0 && valid.every((entry) => entry.state === "done" || entry.state === "failed");

  const patch = (id, changes) => {
    setEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry)));
  };

  const run = async () => {
    cancelled.current = false;
    setRunning(true);
    let created = 0;
    let failed = 0;
    for (const entry of pending) {
      if (cancelled.current) {
        break;
      }
      patch(entry.id, { state: "uploading", progress: 0, detail: "" });
      try {
        const result = await bulkUpload({
          vendor,
          files: [entry.file],
          onUploadProgress: (event) => {
            if (event.total) {
              patch(entry.id, { progress: Math.round((event.loaded / event.total) * 100) });
            }
          },
        });
        const error = result.errors?.[0];
        if (error) {
          failed += 1;
          patch(entry.id, { state: "failed", detail: error.detail });
        } else {
          created += 1;
          patch(entry.id, { state: "done", progress: 100, detail: "waiting for OCR review", invoiceId: result.invoice_ids?.[0] });
        }
      } catch (error) {
        failed += 1;
        patch(entry.id, { state: "failed", detail: apiErrorMessage(error, { fallback: "Upload failed." }) });
      }
    }
    setRunning(false);
    if (created) {
      onBatchFinished();
    }
    if (created && !failed) {
      toast.success(`${created} invoice${created === 1 ? "" : "s"} captured. Review each extraction before approval.`);
    } else if (failed) {
      toast.error(`${failed} file${failed === 1 ? "" : "s"} couldn't be captured. See the list for details.`);
    }
  };

  const vendorName = vendors.rows.find((item) => String(item.id) === vendor)?.name;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!running) {
          onOpenChange(next);
        }
      }}
    >
      <DialogContent className="max-w-2xl" hideClose={running}>
        <DialogHeader>
          <DialogTitle>Capture invoices</DialogTitle>
          <DialogDescription>
            Drop one invoice to review its OCR fields, or several to capture them in one batch for a vendor.
          </DialogDescription>
        </DialogHeader>

        <DropZone onFiles={addFiles} disabled={running} compact={entries.length > 0} />

        {entries.length > 0 && (
          <>
            <BatchVendor vendors={vendors} value={vendor} onChange={setVendor} disabled={running} />
            <FileList
              entries={entries}
              running={running}
              onRemove={(id) => setEntries((current) => current.filter((entry) => entry.id !== id))}
            />
            {batchError && (
              <p role="alert" className="text-sm text-danger">
                {batchError}
              </p>
            )}
          </>
        )}

        {entries.length > 0 && (
          <DialogFooter>
            {running ? (
              <Button variant="outline" onClick={() => { cancelled.current = true; }}>
                Stop after this file
              </Button>
            ) : (
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {finished ? "Done" : "Cancel"}
              </Button>
            )}
            {!finished && (
              <Button
                onClick={run}
                loading={running}
                disabled={running || !vendor || !pending.length || Boolean(batchError)}
              >
                {!running && <Upload />}
                {running
                  ? "Uploading…"
                  : `Upload ${pending.length} file${pending.length === 1 ? "" : "s"}${vendorName ? ` for ${vendorName}` : ""}`}
              </Button>
            )}
            {finished && pending.length > 0 && (
              <Button onClick={run} disabled={!vendor || Boolean(batchError)}>
                Retry {pending.length} failed
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DropZone({ onFiles, disabled, compact }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const onDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    if (!disabled && event.dataTransfer.files?.length) {
      onFiles(event.dataTransfer.files);
    }
  };

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) {
          setDragging(true);
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 text-center transition-colors",
        compact ? "py-6" : "py-12",
        dragging ? "border-primary bg-primary-subtle" : "border-border-strong bg-muted/40",
        disabled && "opacity-60",
      )}
    >
      <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground">
        <Upload className="size-5" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">
          {compact ? "Drop more files to add them to the batch" : "Drag invoices here"}
        </p>
        <p className="text-xs text-muted-foreground">PDF, JPG, PNG or TIFF · up to 25 MB each · 50 files per batch</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        Choose files
      </Button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT_ATTRIBUTE}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          onFiles(event.target.files || []);
          event.target.value = "";
        }}
      />
    </div>
  );
}

function BatchVendor({ vendors, value, onChange, disabled }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="batch-vendor">Vendor for this batch</Label>
      <Select value={value || undefined} onValueChange={onChange} disabled={disabled || vendors.loading || Boolean(vendors.error)}>
        <SelectTrigger id="batch-vendor">
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
      {vendors.error ? (
        <p role="alert" className="text-xs text-danger">
          {vendors.error}{" "}
          <button type="button" className="font-medium underline" onClick={vendors.reload}>
            Retry
          </button>
        </p>
      ) : (
        !vendors.loading && vendors.rows.length === 0 && (
          <p className="text-xs text-muted-foreground">No vendors yet. Add a vendor before capturing invoices.</p>
        )
      )}
    </div>
  );
}

const STATE_META = {
  queued: { label: "Ready", icon: null },
  uploading: { label: "Uploading and reading", icon: LoaderCircle },
  done: { label: "Captured", icon: CircleCheck },
  failed: { label: "Failed", icon: CircleX },
};

function FileList({ entries, running, onRemove }) {
  return (
    <ul className="flex max-h-72 flex-col divide-y divide-border overflow-y-auto rounded-lg border border-border" aria-live="polite">
      {entries.map((entry) => (
        <FileRow key={entry.id} entry={entry} running={running} onRemove={onRemove} />
      ))}
    </ul>
  );
}

function FileRow({ entry, running, onRemove }) {
  const KindIcon = fileKind(entry.file) === "pdf" ? FileText : FileImage;
  const meta = STATE_META[entry.state];
  const StateIcon = meta.icon;
  const message = entry.error || entry.detail;
  const failed = Boolean(entry.error) || entry.state === "failed";

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <KindIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate text-sm font-medium">{entry.file.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatBytes(entry.file.size)}</span>
        </div>
        {entry.state === "uploading" && (
          <div
            role="progressbar"
            aria-label={`Uploading ${entry.file.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={entry.progress}
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${Math.max(entry.progress, 4)}%` }}
            />
          </div>
        )}
        <p
          className={cn(
            "flex items-center gap-1.5 text-xs",
            failed ? "text-danger" : entry.state === "done" ? "text-success" : "text-muted-foreground",
          )}
        >
          {StateIcon && (
            <StateIcon
              className={cn("size-3.5 shrink-0", entry.state === "uploading" && "animate-spin")}
              aria-hidden="true"
            />
          )}
          {entry.error ? "Skipped" : meta.label}
          {entry.state === "uploading" && entry.progress === 100 && " — running OCR"}
          {message && <span className="min-w-0">· {message}</span>}
        </p>
      </div>
      {!running && entry.state !== "done" && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove ${entry.file.name}`}
          onClick={() => onRemove(entry.id)}
        >
          <Trash2 />
        </Button>
      )}
    </li>
  );
}
