import React from "react";
import { cn } from "@/lib/utils";
import { controlClasses } from "./input";

export const Textarea = React.forwardRef(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(controlClasses, "min-h-20 px-3 py-2 leading-relaxed", className)}
      {...props}
    />
  );
});
