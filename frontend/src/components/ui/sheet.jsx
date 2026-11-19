import React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cva } from "class-variance-authority";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DialogOverlay } from "./dialog";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

const sheetVariants = cva(
  [
    "fixed z-50 flex flex-col bg-popover text-popover-foreground shadow-popover outline-none",
  ],
  {
    variants: {
      side: {
        right: [
          "inset-y-0 right-0 h-full w-full border-l border-border sm:max-w-md",
          "data-[state=open]:animate-slide-in-right data-[state=closed]:animate-slide-out-right",
        ],
        left: [
          "inset-y-0 left-0 h-full w-full border-r border-border sm:max-w-md",
          "data-[state=open]:animate-slide-in-left data-[state=closed]:animate-slide-out-left",
        ],
        bottom: [
          "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-lg border-t border-border",
          "data-[state=open]:animate-slide-in-bottom data-[state=closed]:animate-slide-out-bottom",
        ],
      },
    },
    defaultVariants: {
      side: "right",
    },
  },
);

/** Side drawer for record details and long forms. Body scrolls; header and footer stay put. */
export const SheetContent = React.forwardRef(function SheetContent(
  { side = "right", className, children, ...props },
  ref,
) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        data-ui=""
        className={cn(sheetVariants({ side }), className)}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className={cn(
            "absolute right-4 top-4 rounded-md p-1 text-muted-foreground transition-colors",
            "hover:bg-accent hover:text-foreground focus-visible:outline-none",
            "focus-visible:ring-[3px] focus-visible:ring-ring/35",
          )}
        >
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});

export function SheetHeader({ className, ...props }) {
  return (
    <div
      className={cn("flex flex-col gap-1.5 border-b border-border px-6 py-4 pr-12", className)}
      {...props}
    />
  );
}

export function SheetBody({ className, ...props }) {
  return <div className={cn("flex-1 overflow-y-auto px-6 py-6", className)} {...props} />;
}

export function SheetFooter({ className, ...props }) {
  return (
    <div
      className={cn("flex flex-col-reverse gap-2 border-t border-border px-6 py-4 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

export const SheetTitle = React.forwardRef(function SheetTitle({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn("text-base font-semibold leading-tight tracking-tight", className)}
      {...props}
    />
  );
});

export const SheetDescription = React.forwardRef(function SheetDescription({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
});
