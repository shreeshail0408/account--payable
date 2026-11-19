import React from "react";
import * as MenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const DropdownMenu = MenuPrimitive.Root;
export const DropdownMenuTrigger = MenuPrimitive.Trigger;
export const DropdownMenuGroup = MenuPrimitive.Group;

const itemClasses = [
  "relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none",
  "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg]:text-muted-foreground",
];

export const DropdownMenuContent = React.forwardRef(function DropdownMenuContent(
  { className, sideOffset = 4, align = "end", ...props },
  ref,
) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        ref={ref}
        data-ui=""
        sideOffset={sideOffset}
        align={align}
        className={cn(
          "z-50 min-w-44 overflow-hidden rounded-md border border-border bg-popover p-1",
          "text-popover-foreground shadow-popover",
          "data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out",
          className,
        )}
        {...props}
      />
    </MenuPrimitive.Portal>
  );
});

/** `variant="destructive"` for irreversible actions (delete, reject, block). */
export const DropdownMenuItem = React.forwardRef(function DropdownMenuItem(
  { className, variant = "default", ...props },
  ref,
) {
  return (
    <MenuPrimitive.Item
      ref={ref}
      className={cn(
        itemClasses,
        variant === "destructive" && "text-danger data-[highlighted]:bg-danger-subtle data-[highlighted]:text-danger [&_svg]:text-danger",
        className,
      )}
      {...props}
    />
  );
});

export const DropdownMenuCheckboxItem = React.forwardRef(function DropdownMenuCheckboxItem(
  { className, children, ...props },
  ref,
) {
  return (
    <MenuPrimitive.CheckboxItem
      ref={ref}
      className={cn(itemClasses, "pl-8", className)}
      {...props}
    >
      <span className="absolute left-2 flex size-4 items-center justify-center">
        <MenuPrimitive.ItemIndicator>
          <Check className="size-4 text-primary" />
        </MenuPrimitive.ItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  );
});

export const DropdownMenuLabel = React.forwardRef(function DropdownMenuLabel({ className, ...props }, ref) {
  return (
    <MenuPrimitive.Label
      ref={ref}
      className={cn("px-2 py-1.5 text-xs font-medium text-muted-foreground", className)}
      {...props}
    />
  );
});

export const DropdownMenuSeparator = React.forwardRef(function DropdownMenuSeparator({ className, ...props }, ref) {
  return (
    <MenuPrimitive.Separator
      ref={ref}
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
});

export function DropdownMenuShortcut({ className, ...props }) {
  return (
    <span
      className={cn("ml-auto text-xs tracking-widest text-muted-foreground", className)}
      {...props}
    />
  );
}
