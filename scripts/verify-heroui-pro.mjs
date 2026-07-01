import { existsSync } from "node:fs";
import { join } from "node:path";

const typesPath = join(
  process.cwd(),
  "node_modules",
  "@heroui-pro",
  "react",
  "dist",
  "index.d.ts",
);

if (!existsSync(typesPath)) {
  console.error(
    [
      "@heroui-pro/react is not installed (missing dist/index.d.ts).",
      "",
      "HeroUI Pro downloads component artifacts during postinstall.",
      "Set HEROUI_AUTH_TOKEN from https://heroui.pro/dashboard, then run:",
      "",
      "  pnpm rebuild @heroui-pro/react",
      "",
    ].join("\n"),
  );
  process.exit(1);
}
