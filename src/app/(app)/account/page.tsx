import { redirect } from "next/navigation";

export default async function AccountRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const incoming = await searchParams;
  const target = new URLSearchParams({ tab: "billing" });
  for (const [key, value] of Object.entries(incoming)) {
    if (key === "tab" || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) target.append(key, item);
  }
  redirect(`/settings?${target.toString()}`);
}
