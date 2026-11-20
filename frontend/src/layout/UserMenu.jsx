import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, KeyRound, LogOut, Monitor, Moon, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/theme-provider";
import { ROLE_LABELS, useAuth } from "@/auth";
import { cn } from "@/lib/utils";
import { ChangePasswordDialog } from "@/features/account/ChangePasswordDialog";

const THEME_OPTIONS = [
  ["light", "Light", Sun],
  ["dark", "Dark", Moon],
  ["system", "System", Monitor],
];

function initials(user) {
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.username || "?";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function UserMenu() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [changingPassword, setChangingPassword] = useState(false);
  const displayName = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.username;
  const roleLabel = ROLE_LABELS[user?.role] || user?.role;

  const signOut = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <>
      <AccountDropdown
        user={user}
        displayName={displayName}
        roleLabel={roleLabel}
        theme={theme}
        setTheme={setTheme}
        onChangePassword={() => setChangingPassword(true)}
        onSignOut={signOut}
      />
      <ChangePasswordDialog open={changingPassword} onOpenChange={setChangingPassword} />
    </>
  );
}

function AccountDropdown({ user, displayName, roleLabel, theme, setTheme, onChangePassword, onSignOut }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex items-center gap-2 rounded-md py-1 pl-1 pr-1 text-left outline-none transition-colors sm:pr-2",
          "hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/35",
        )}
        aria-label={`Account menu for ${displayName}`}
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-primary-subtle text-xs font-semibold text-primary-subtle-foreground">
          {initials(user)}
        </span>
        <span className="hidden flex-col leading-tight sm:flex">
          <span className="max-w-32 truncate text-sm font-medium">{displayName}</span>
          <span className="text-[11px] text-muted-foreground">{roleLabel}</span>
        </span>
        <ChevronDown className="hidden size-4 text-muted-foreground sm:block" aria-hidden="true" />
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5 py-2 font-normal">
          <span className="truncate text-sm font-medium text-foreground">{displayName}</span>
          <span className="truncate text-xs text-muted-foreground">
            {roleLabel}
            {user?.email && ` · ${user.email}`}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          {THEME_OPTIONS.map(([value, label, Icon]) => (
            <DropdownMenuRadioItem
              key={value}
              value={value}
              onSelect={(event) => event.preventDefault()}
            >
              <Icon />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onChangePassword}>
          <KeyRound />
          Change password
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onSignOut}>
          <LogOut />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
