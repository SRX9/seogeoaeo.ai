"use client";

import { Button } from "@heroui/react";
import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "@/components/icons";

type Theme = "light" | "dark";

function apply(theme: Theme) {
  const root = document.documentElement;
  // Apply both the base mode class (foreground/text palette) and the Glass
  // mode class (surfaces). The Glass theme omits `--foreground`, so the base
  // `light`/`dark` class is what makes text legible in dark mode.
  root.classList.remove("light", "dark", "glass-light", "glass-dark");
  root.classList.add(theme, theme === "dark" ? "glass-dark" : "glass-light");
}

/**
 * Toggles the Lunar Grey theme between light and dark by swapping the
 * `glass-light` / `glass-dark` class on <html> and persisting the choice.
 * The pre-paint script in app/layout.tsx applies the saved value on load.
 */
export function ThemeToggle({ className }: { className?: string }) {
  // Start unset to match the server render; the effect reads the real value
  // the no-FOUC script already applied, avoiding a hydration mismatch.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("glass-dark") ? "dark" : "light");
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    apply(next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Ignore storage errors (private mode, blocked cookies, etc.).
    }
    setTheme(next);
  }

  const isDark = theme === "dark";

  return (
    <Button
      variant="ghost"
      size="sm"
      isIconOnly
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className={className}
      onPress={toggle}
    >
      {theme === null ? (
        <span className="size-4" />
      ) : isDark ? (
        <SunIcon className="size-4" />
      ) : (
        <MoonIcon className="size-4" />
      )}
    </Button>
  );
}
