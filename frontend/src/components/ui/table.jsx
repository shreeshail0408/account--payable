import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/*
 * Data table. Put `numeric` on TableHead/TableCell for amounts and quantities:
 * it right-aligns the column and switches to tabular numbers.
 */
export function Table({ className, containerClassName, ...props }) {
  const containerRef = useRef(null);
  const scrollable = useHorizontalOverflow(containerRef);
  return (
    <div
      ref={containerRef}
      // A table wider than its container scrolls sideways; make it reachable by keyboard then.
      tabIndex={scrollable ? 0 : undefined}
      role={scrollable ? "region" : undefined}
      aria-label={scrollable ? props["aria-label"] || "Scrollable table" : undefined}
      className={cn(
        "relative w-full overflow-x-auto rounded-[inherit] outline-none",
        "focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/35",
        containerClassName,
      )}
    >
      <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}

/** True while the element's content is wider than the element. */
function useHorizontalOverflow(ref) {
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") {
      return undefined;
    }
    const measure = () => setOverflowing(element.scrollWidth > element.clientWidth + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.firstElementChild) {
      observer.observe(element.firstElementChild);
    }
    measure();
    return () => observer.disconnect();
  }, [ref]);
  return overflowing;
}

export function TableHeader({ className, ...props }) {
  return <thead className={cn("[&_tr]:border-b [&_tr]:border-border", className)} {...props} />;
}

export function TableBody({ className, ...props }) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

export function TableFooter({ className, ...props }) {
  return (
    <tfoot
      className={cn("border-t border-border bg-muted/50 font-medium [&>tr]:last:border-b-0", className)}
      {...props}
    />
  );
}

export function TableRow({ className, ...props }) {
  return (
    <tr
      className={cn(
        "border-b border-border transition-colors hover:bg-muted/50 data-[state=selected]:bg-primary-subtle",
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({ className, numeric = false, ...props }) {
  return (
    <th
      data-numeric={numeric || undefined}
      className={cn(
        "h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-medium text-muted-foreground",
        numeric && "text-right tabular-nums",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, numeric = false, ...props }) {
  return (
    <td
      data-numeric={numeric || undefined}
      className={cn(
        "whitespace-nowrap px-4 py-3 align-middle",
        numeric && "text-right tabular-nums",
        className,
      )}
      {...props}
    />
  );
}

export function TableCaption({ className, ...props }) {
  return <caption className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />;
}
