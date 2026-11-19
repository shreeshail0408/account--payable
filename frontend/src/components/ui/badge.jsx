import React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  [
    "inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-md border",
    "px-2 py-0.5 text-xs font-medium leading-5",
    "[&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        neutral: "border-neutral-border bg-neutral-subtle text-neutral-subtle-foreground",
        primary: "border-primary-border bg-primary-subtle text-primary-subtle-foreground",
        success: "border-success-border bg-success-subtle text-success-subtle-foreground",
        warning: "border-warning-border bg-warning-subtle text-warning-subtle-foreground",
        danger: "border-danger-border bg-danger-subtle text-danger-subtle-foreground",
        info: "border-info-border bg-info-subtle text-info-subtle-foreground",
        outline: "border-border-strong bg-transparent text-foreground",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export function Badge({ className, variant, asChild = false, ...props }) {
  const Component = asChild ? Slot : "span";
  return <Component className={cn(badgeVariants({ variant }), className)} {...props} />;
}
