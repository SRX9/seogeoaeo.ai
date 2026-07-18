import { describe, expect, it, vi } from "vitest";
import {
  wordpressArticleMetaUpdateAdapter as adapter,
  type WordPressArticleMetaRawState,
} from "@/lib/connectors/wordpress";
import { getConnectorAdapter } from "@/lib/connectors/registry";
import type { ConnectorContext } from "@/lib/connectors/types";
import type {
  WordPressArticleMetaConfig,
  WordPressArticleMetaSecrets,
} from "@/lib/connectors/wordpress";

function response(state: WordPressArticleMetaRawState) {
  return new Response(JSON.stringify(state), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function fixture() {
  const beforeRevision = "a".repeat(64);
  const afterRevision = "b".repeat(64);
  let state: WordPressArticleMetaRawState = {
    protocol: "claudia-wordpress-mutation-v1",
    plugin_version: "1.0.0",
    id: 42,
    link: "https://blog.example.com/posts/original",
    modified_gmt: "2026-07-15T09:00:00",
    slug: "original",
    revision: beforeRevision,
    excerpt: "Original excerpt",
    status: "publish",
  };
  const writes: Array<Record<string, unknown>> = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(String(input)).toBe(
      "https://blog.example.com/wp-json/claudia/v1/posts/42/metadata",
    );
    if (init?.method === "POST") {
      const update = JSON.parse(String(init.body)) as {
        operation: "apply" | "rollback";
        changes: Partial<
          Record<"slug" | "excerpt", { before: string; after: string }>
        >;
      };
      writes.push(update);
      state = {
        ...state,
        slug: update.changes.slug?.after ?? state.slug,
        excerpt: update.changes.excerpt?.after ?? state.excerpt,
        revision: update.operation === "rollback" ? beforeRevision : afterRevision,
        modified_gmt: "2026-07-15T09:01:00",
      };
    }
    return response(state);
  });
  const context: ConnectorContext<WordPressArticleMetaConfig, WordPressArticleMetaSecrets> = {
    config: {
      siteUrl: "https://blog.example.com/wp-json/",
      username: "editor",
    },
    secrets: { wordpress_application_password: "abcd efgh ijkl" },
    remoteResourceId: "42",
    idempotencyKey: "action-42-v1",
    expectedRevision: beforeRevision,
    fetch,
  };
  return {
    context,
    fetch,
    writes,
    getState: () => state,
    setState: (next: WordPressArticleMetaRawState) => {
      state = next;
    },
  };
}

describe("WordPress article metadata connector", () => {
  it("writes an exact diff, verifies read-back, and remotely restores the before state", async () => {
    expect(getConnectorAdapter("wordpress", "article.meta.update")?.version).toBe(
      "wordpress-companion-v1",
    );
    const remote = fixture();
    const before = adapter.normalize(await adapter.read(remote.context));
    const diff = adapter.constructDiff(before, {
      slug: "corrected",
      excerpt: "Corrected excerpt",
    });
    expect(diff).toEqual([
      { field: "slug", before: "original", after: "corrected" },
      { field: "excerpt", before: "Original excerpt", after: "Corrected excerpt" },
    ]);

    await adapter.write(remote.context, diff);
    const after = adapter.normalize(await adapter.read(remote.context));
    expect(adapter.verify(diff, after)).toEqual({ ok: true });
    expect(remote.writes[0]).toMatchObject({
      operation: "apply",
      expected_revision: "a".repeat(64),
      changes: {
        slug: { before: "original", after: "corrected" },
        excerpt: { before: "Original excerpt", after: "Corrected excerpt" },
      },
    });

    const rollback = await adapter.rollback(remote.context, diff);
    expect(rollback).toMatchObject({ status: "reverted" });
    expect(remote.writes[1]).toMatchObject({
      operation: "rollback",
      expected_revision: "b".repeat(64),
      changes: {
        slug: { before: "corrected", after: "original" },
        excerpt: { before: "Corrected excerpt", after: "Original excerpt" },
      },
    });
    expect(remote.getState()).toMatchObject({
      slug: "original",
      excerpt: "Original excerpt",
    });
  });

  it("refuses rollback without writing when an intended field has drifted", async () => {
    const remote = fixture();
    const before = adapter.normalize(await adapter.read(remote.context));
    const diff = adapter.constructDiff(before, { slug: "corrected" });
    remote.setState({
      ...remote.getState(),
      slug: "owner-edit",
      modified_gmt: "2026-07-15T09:05:00",
    });

    const rollback = await adapter.rollback(remote.context, diff);
    expect(rollback).toEqual({
      status: "manual_recovery_required",
      reason: "remote_drift",
      wrote: false,
      state: expect.objectContaining({ slug: "owner-edit" }),
      unexpected: [{ field: "slug", expected: "corrected", actual: "owner-edit" }],
    });
    expect(remote.writes).toHaveLength(0);
  });
});
