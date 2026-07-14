"use client";

import { Button } from "@heroui/react";
import { useSyncExternalStore } from "react";
import { MoonIcon, SunIcon } from "@/components/icons";
import { cn } from "@/lib/cn";

type Theme = "light" | "dark";
const THEME_CHANGE_EVENT = "sga-theme-change";

function apply(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove("light", "dark", "glass-light", "glass-dark");
  root.classList.add(theme, theme === "dark" ? "glass-dark" : "glass-light");
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

function subscribeToTheme(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange);
  };
}

function getThemeSnapshot(): Theme {
  return document.documentElement.classList.contains("glass-dark") ? "dark" : "light";
}

function getServerThemeSnapshot(): Theme {
  return "light";
}

/**
 * Toggles the HeroUI Glass theme between light and dark and persists it.
 * The pre-paint script in app/layout.tsx applies the saved value on load.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    apply(next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Ignore storage errors (private mode, blocked cookies, etc.).
    }
  }

  const isDark = theme === "dark";

  return (
    <Button
      variant="ghost"
      size="sm"
      isIconOnly
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className={cn("rounded-full", className)}
      onPress={toggle}
    >
      {isDark ? (
        <SunIcon className="size-4" />
      ) : (
        <MoonIcon className="size-4" />
      )}
    </Button>
  );
}
