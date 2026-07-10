"use client";

import { Avatar, Button, Dropdown, Label } from "@heroui/react";
import { useRouter } from "next/navigation";
import { BrandSwitcher } from "@/components/brand/brand-switcher";
import { CreditCardIcon, SettingsIcon } from "@/components/icons";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { authClient } from "@/lib/auth/client";
import type { SessionUser } from "@/lib/auth/session";

type BrandOption = { id: string; name: string };

function initials(name: string) {
  return (
    name
      .split(" ")
      .flatMap((part) => (part[0] ? [part[0]] : []))
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U"
  );
}

function signOut() {
  authClient.signOut({
    fetchOptions: { onSuccess: () => window.location.assign("/login") },
  });
}

export function BrandCapsule({
  user,
  brands,
  activeBrandId,
}: {
  user: SessionUser;
  brands: BrandOption[];
  activeBrandId: string | null;
}) {
  const router = useRouter();
  return (
    <div className="brand-capsule">
      <div className="min-w-0 flex-1 sm:w-48 sm:flex-none">
        <BrandSwitcher brands={brands} activeBrandId={activeBrandId} />
      </div>
      <ThemeToggle className="size-11 shrink-0" />
      <Dropdown>
        <Button
          isIconOnly
          aria-label="Account menu"
          variant="ghost"
          className="size-11 shrink-0 rounded-full"
        >
          <Avatar size="sm">
            {user.image ? <Avatar.Image alt={user.name} src={user.image} /> : null}
            <Avatar.Fallback>{initials(user.name)}</Avatar.Fallback>
          </Avatar>
        </Button>
        <Dropdown.Popover placement="bottom end">
          <div className="max-w-60 px-3 pb-2 pt-3">
            <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
          <Dropdown.Menu
            onAction={(key) => {
              if (key === "brand") router.push("/settings");
              if (key === "billing") router.push("/account");
              if (key === "sign-out") signOut();
            }}
          >
            <Dropdown.Item id="brand" textValue="Brand settings">
              <SettingsIcon className="size-4 text-muted" />
              <Label>Brand settings</Label>
            </Dropdown.Item>
            <Dropdown.Item id="billing" textValue="Billing and account">
              <CreditCardIcon className="size-4 text-muted" />
              <Label>Billing and account</Label>
            </Dropdown.Item>
            <Dropdown.Item id="sign-out" variant="danger" textValue="Sign out">
              <Label>Sign out</Label>
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    </div>
  );
}
