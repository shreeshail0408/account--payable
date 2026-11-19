import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FileQuestion,
  Maximize2,
  RotateCcw,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState, ErrorState } from "@/components/states";
import { cn } from "@/lib/utils";
import { fileKind } from "../model";
import { openPdf } from "./pdf";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const MAX_THUMBNAILS = 40;

/*
 * Loads a document into "pages" with a common interface:
 *   size(index, rotation)                 -> {width, height} at scale 1
 *   render(index, canvas, scale, rotation) -> Promise, cancellable via the returned cancel()
 * Images are one page drawn onto a canvas; PDFs go through PDF.js.
 */
function useDocument(source) {
  const [state, setState] = useState({ status: "idle", pageCount: 0, error: "" });
  const docRef = useRef(null);
  const [attempt, setAttempt] = useState(0);
  const kind = source ? fileKind({ name: source.name, type: source.file?.type }) : null;

  useEffect(() => {
    if (!source || kind === "tiff") {
      setState({ status: kind === "tiff" ? "unsupported" : "idle", pageCount: 0, error: "" });
      return undefined;
    }
    let cancelled = false;
    let objectUrl = null;
    setState({ status: "loading", pageCount: 0, error: "" });

    const load = async () => {
      if (kind === "pdf") {
        const pdf = await openPdf(source);
        const sizes = {};
        return {
          pageCount: pdf.numPages,
          destroy: () => pdf.destroy(),
          async size(index, rotation) {
            if (!sizes[index]) {
              sizes[index] = await pdf.getPage(index + 1);
            }
            const page = sizes[index];
            const viewport = page.getViewport({ scale: 1, rotation: (page.rotate + rotation) % 360 });
            return { width: viewport.width, height: viewport.height };
          },
          render(index, canvas, scale, rotation) {
            let task = null;
            let stopped = false;
            const promise = pdf.getPage(index + 1).then((page) => {
              if (stopped) {
                return;
              }
              const ratio = window.devicePixelRatio || 1;
              const viewport = page.getViewport({ scale: scale * ratio, rotation: (page.rotate + rotation) % 360 });
              canvas.width = Math.floor(viewport.width);
              canvas.height = Math.floor(viewport.height);
              canvas.style.width = `${Math.floor(viewport.width / ratio)}px`;
              canvas.style.height = `${Math.floor(viewport.height / ratio)}px`;
              task = page.render({ canvasContext: canvas.getContext("2d"), viewport });
              return task.promise;
            });
            return {
              promise: promise.catch((error) => {
                if (error?.name !== "RenderingCancelledException") {
                  throw error;
                }
              }),
              cancel: () => {
                stopped = true;
                task?.cancel();
              },
            };
          },
        };
      }

      objectUrl = source.file ? URL.createObjectURL(source.file) : null;
      const image = await new Promise((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error("This image couldn't be displayed."));
        element.src = objectUrl || source.url;
      });
      const rotatedSize = (rotation) => (
        rotation % 180 === 0
          ? { width: image.naturalWidth, height: image.naturalHeight }
          : { width: image.naturalHeight, height: image.naturalWidth }
      );
      return {
        pageCount: 1,
        destroy: () => {},
        size: async (_index, rotation) => rotatedSize(rotation),
        render(_index, canvas, scale, rotation) {
          const ratio = window.devicePixelRatio || 1;
          const { width, height } = rotatedSize(rotation);
          canvas.width = Math.floor(width * scale * ratio);
          canvas.height = Math.floor(height * scale * ratio);
          canvas.style.width = `${Math.floor(width * scale)}px`;
          canvas.style.height = `${Math.floor(height * scale)}px`;
          const context = canvas.getContext("2d");
          context.setTransform(1, 0, 0, 1, 0, 0);
          context.translate(canvas.width / 2, canvas.height / 2);
          context.rotate((rotation * Math.PI) / 180);
          const drawWidth = image.naturalWidth * scale * ratio;
          const drawHeight = image.naturalHeight * scale * ratio;
          context.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
          return { promise: Promise.resolve(), cancel: () => {} };
        },
      };
    };

    load()
      .then((doc) => {
        if (cancelled) {
          doc.destroy();
          return;
        }
        docRef.current = doc;
        setState({ status: "ready", pageCount: doc.pageCount, error: "" });
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            status: "error",
            pageCount: 0,
            error: error?.message || "The document couldn't be displayed.",
          });
        }
      });

    return () => {
      cancelled = true;
      docRef.current?.destroy();
      docRef.current = null;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [source, kind, attempt]);

  return { ...state, kind, doc: docRef, retry: () => setAttempt((value) => value + 1) };
}

function useElementWidth() {
  const [width, setWidth] = useState(0);
  const observer = useRef(null);
  const ref = useCallback((element) => {
    observer.current?.disconnect();
    if (element) {
      observer.current = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
      observer.current.observe(element);
    }
  }, []);
  return [ref, width];
}

/** Left half of the review screen: the source document (with page thumbnails) and the OCR text. */
export function DocumentPreview({ source, ocrText, className }) {
  const document = useDocument(source);
  const [tab, setTab] = useState("document");

  useEffect(() => {
    setTab(document.kind === "tiff" ? "text" : "document");
  }, [document.kind]);

  return (
    <Tabs value={tab} onValueChange={setTab} className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-2">
        <TabsList>
          <TabsTrigger value="document">Document</TabsTrigger>
          <TabsTrigger value="text">OCR text</TabsTrigger>
        </TabsList>
        {source?.name && (
          <span className="min-w-0 truncate text-xs text-muted-foreground" title={source.name}>
            {source.name}
          </span>
        )}
      </div>
      <TabsContent value="document" className="mt-0 flex min-h-0 flex-1 flex-col">
        <DocumentView document={document} hasSource={Boolean(source)} />
      </TabsContent>
      <TabsContent value="text" className="mt-0 min-h-0 flex-1 overflow-auto p-4">
        {ocrText ? (
          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground">
            {ocrText}
          </pre>
        ) : (
          <EmptyState title="No OCR text" description="OCR didn't return any text for this document." />
        )}
      </TabsContent>
    </Tabs>
  );
}

function DocumentView({ document, hasSource }) {
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [viewportRef, viewportWidth] = useElementWidth();

  useEffect(() => {
    setPage(0);
    setZoom(1);
    setRotation(0);
  }, [document.doc.current]);

  if (!hasSource) {
    return <EmptyState icon={FileQuestion} title="No document attached" description="This invoice has no source file." />;
  }
  if (document.status === "unsupported") {
    return (
      <EmptyState
        icon={FileQuestion}
        title="TIFF can't be shown in the browser"
        description="Compare the fields with the OCR text tab, or open the original file on your computer."
      />
    );
  }
  if (document.status === "error") {
    return <ErrorState title="Couldn't show the document" description={document.error} onRetry={document.retry} />;
  }
  if (document.status !== "ready") {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4" role="status" aria-label="Loading document">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="w-full flex-1" />
      </div>
    );
  }

  const pageCount = document.pageCount;
  const changeZoom = (delta) => setZoom((value) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((value + delta) * 100) / 100)));

  return (
    <>
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1">
        {pageCount > 1 && (
          <div className="flex items-center gap-1">
            <IconButton label="Previous page" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0}>
              <ChevronLeft />
            </IconButton>
            <span className="min-w-20 text-center text-xs tabular-nums" aria-live="polite">
              Page {page + 1} of {pageCount}
            </span>
            <IconButton
              label="Next page"
              onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
              disabled={page >= pageCount - 1}
            >
              <ChevronRight />
            </IconButton>
          </div>
        )}
        <div className="ml-auto flex items-center gap-1">
          <IconButton label="Zoom out" onClick={() => changeZoom(-0.25)} disabled={zoom <= MIN_ZOOM}>
            <ZoomOut />
          </IconButton>
          <span className="w-12 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
          <IconButton label="Zoom in" onClick={() => changeZoom(0.25)} disabled={zoom >= MAX_ZOOM}>
            <ZoomIn />
          </IconButton>
          <IconButton label="Fit to width" onClick={() => setZoom(1)} disabled={zoom === 1}>
            <Maximize2 />
          </IconButton>
          <IconButton label="Rotate left" onClick={() => setRotation((value) => (value + 270) % 360)}>
            <RotateCcw />
          </IconButton>
          <IconButton label="Rotate right" onClick={() => setRotation((value) => (value + 90) % 360)}>
            <RotateCw />
          </IconButton>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        {pageCount > 1 && (
          <Thumbnails document={document} pageCount={pageCount} current={page} rotation={rotation} onSelect={setPage} />
        )}
        <div ref={viewportRef} className="min-h-0 min-w-0 flex-1 overflow-auto bg-muted/60 p-4">
          {viewportWidth > 0 && (
            <PageCanvas
              document={document}
              index={page}
              rotation={rotation}
              width={(viewportWidth - 32) * zoom}
              label={`Page ${page + 1} of ${pageCount}`}
              className="mx-auto shadow-card"
            />
          )}
        </div>
      </div>
    </>
  );
}

function IconButton({ label, children, ...props }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Renders one page fitted to `width` CSS px. */
function PageCanvas({ document, index, rotation, width, label, className }) {
  const canvasRef = useRef(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const doc = document.doc.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas || width <= 0) {
      return undefined;
    }
    let job = null;
    let stopped = false;
    setError("");
    doc.size(index, rotation).then((size) => {
      if (stopped) {
        return;
      }
      job = doc.render(index, canvas, width / size.width, rotation);
      job.promise.catch(() => {
        if (!stopped) {
          setError("This page couldn't be rendered.");
        }
      });
    });
    return () => {
      stopped = true;
      job?.cancel();
    };
  }, [document.doc, index, rotation, width]);

  if (error) {
    return <p className="p-4 text-sm text-danger">{error}</p>;
  }
  return <canvas ref={canvasRef} role="img" aria-label={label} className={cn("block bg-card", className)} />;
}

function Thumbnails({ document, pageCount, current, rotation, onSelect }) {
  const shown = Math.min(pageCount, MAX_THUMBNAILS);
  return (
    <nav
      aria-label="Pages"
      className="flex shrink-0 gap-2 overflow-auto border-b border-border p-2 sm:w-28 sm:flex-col sm:border-b-0 sm:border-r"
    >
      {Array.from({ length: shown }, (_, index) => (
        <button
          key={index}
          type="button"
          onClick={() => onSelect(index)}
          aria-current={index === current ? "page" : undefined}
          aria-label={`Page ${index + 1}`}
          className={cn(
            "flex shrink-0 flex-col items-center gap-1 rounded-md border-2 p-1 outline-none",
            "focus-visible:ring-[3px] focus-visible:ring-ring/35",
            index === current ? "border-primary" : "border-transparent hover:border-border-strong",
          )}
        >
          <PageCanvas document={document} index={index} rotation={rotation} width={72} label="" />
          <span className="text-[11px] tabular-nums text-muted-foreground">{index + 1}</span>
        </button>
      ))}
      {pageCount > shown && (
        <span className="self-center px-2 text-[11px] text-muted-foreground">+{pageCount - shown} more</span>
      )}
    </nav>
  );
}
