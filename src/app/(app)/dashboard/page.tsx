import { DashboardPageClient } from "@/components/dashboard/dashboard-page-client";

/**
 * Keep route transitions synchronous. The persistent browser QueryClient owns
 * the live dashboard cache and refreshes it in the background.
 */
export default function DashboardPage() {
  return <DashboardPageClient />;
}
