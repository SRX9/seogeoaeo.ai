import { InboxPageClient } from "@/components/inbox/inbox-page-client";

/** The client cache makes inbox revisits immediate while it revalidates. */
export default function InboxPage() {
  return <InboxPageClient />;
}
