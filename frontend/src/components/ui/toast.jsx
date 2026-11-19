import React from "react";
import { Toaster as SonnerToaster } from "sonner";
import { useTheme } from "@/components/theme-provider";

/*
 * App-wide toaster (mounted once in main.jsx). Raise toasts anywhere with:
 *   import { toast } from "@/components/ui/toast";
 *   toast.success("Invoice submitted for approval");
 *   toast.error("Could not save", { description: detail });
 */
export { toast } from "sonner";

const toastStyle = {
  "--normal-bg": "var(--popover)",
  "--normal-text": "var(--popover-foreground)",
  "--normal-border": "var(--border)",
  "--success-bg": "var(--success-subtle)",
  "--success-text": "var(--success-subtle-foreground)",
  "--success-border": "var(--success-border)",
  "--error-bg": "var(--danger-subtle)",
  "--error-text": "var(--danger-subtle-foreground)",
  "--error-border": "var(--danger-border)",
  "--warning-bg": "var(--warning-subtle)",
  "--warning-text": "var(--warning-subtle-foreground)",
  "--warning-border": "var(--warning-border)",
  "--info-bg": "var(--info-subtle)",
  "--info-text": "var(--info-subtle-foreground)",
  "--info-border": "var(--info-border)",
  "--border-radius": "var(--radius)",
};

export function Toaster(props) {
  const { resolvedTheme } = useTheme();
  return (
    <SonnerToaster
      theme={resolvedTheme}
      position="bottom-right"
      richColors
      closeButton
      style={toastStyle}
      toastOptions={{
        style: { fontFamily: "var(--font-sans)" },
        classNames: {
          description: "text-current! opacity-80",
        },
      }}
      {...props}
    />
  );
}
