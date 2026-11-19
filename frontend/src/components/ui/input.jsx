import React from "react";
import { cn } from "@/lib/utils";

export const controlClasses = [
  "w-full min-w-0 rounded-md border border-input bg-card text-sm text-foreground shadow-card",
  "placeholder:text-muted-foreground transition-[color,box-shadow,border-color] outline-none",
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "aria-invalid:border-danger aria-invalid:focus-visible:ring-danger/25",
];

export const Input = React.forwardRef(function Input({ className, type = "text", ...props }, ref) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        controlClasses,
        "h-9 px-3 py-1",
        "file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        className,
      )}
      {...props}
    />
  );
});
