# Claudia Safe Mutations for WordPress

This directory is an installable, single-file WordPress companion plugin for
Claudia's first live connector capability: changing the slug and/or excerpt of
an already-published standard post.

## Installation

1. Copy `claudia-safe-mutations.php` into
   `wp-content/plugins/claudia-safe-mutations/claudia-safe-mutations.php`.
2. Activate **Claudia Safe Mutations** for the site. On multisite, activate it
   per site; automated network-wide table provisioning is not supported.
3. Create a dedicated WordPress user with only the capabilities needed to edit
   the intended posts, then create an Application Password for that user.
4. Call the endpoints over HTTPS using WordPress Application Password Basic
   authentication. Revoking that Application Password immediately removes
   connector access.

If TLS terminates at a reverse proxy, configure WordPress/PHP so `is_ssl()` is
true for the original HTTPS request. The plugin deliberately does not trust a
forwarded-proto header by itself.

WordPress Application Passwords inherit the user's capabilities; they are not
scoped to one REST namespace. A compromised credential can therefore call core
REST or XML-RPC operations that the dedicated user is allowed to perform, not
only this plugin. Use a connector-only account with the smallest possible role
and post ownership, disable XML-RPC when it is not needed, store the credential
as a secret, and include core-endpoint denial/blast-radius checks in site
certification. Revoke the Application Password before disabling or removing
this plugin.

The plugin fails closed unless both `wp_posts` and its receipt table use
InnoDB. Activation creates `{prefix}claudia_mutation_receipts`; completed
receipts expire after 30 days and the table is capped at 10,000 rows. A daily
cleanup event removes expired receipts.

## Endpoints

- `GET /wp-json/claudia/v1/health`
- `GET /wp-json/claudia/v1/capabilities`
- `GET /wp-json/claudia/v1/posts/{id}/metadata`
- `POST /wp-json/claudia/v1/posts/{id}/metadata`

Every endpoint requires an authenticated user with `edit_posts`. Post
endpoints additionally enforce `current_user_can('edit_post', id)`. Only the
core `post` type in `publish` status is eligible.

The metadata GET and every successful POST return exactly:

```json
{
  "protocol": "claudia-wordpress-mutation-v1",
  "plugin_version": "1.0.0",
  "id": 123,
  "link": "https://example.com/example-post/",
  "modified_gmt": "2026-07-15T12:34:56",
  "revision": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "slug": "example-post",
  "excerpt": "Example excerpt.",
  "status": "publish"
}
```

Mutation request body:

```json
{
  "protocol": "claudia-wordpress-mutation-v1",
  "operation": "apply",
  "expected_revision": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "idempotency_key": "a-stable-key-for-this-logical-operation",
  "changes": {
    "slug": {
      "before": "example-post",
      "after": "updated-example-post"
    },
    "excerpt": {
      "before": "Example excerpt.",
      "after": "Updated excerpt."
    }
  }
}
```

`operation` is either `apply` or `rollback`. Rollback uses the same endpoint,
the revision returned after apply, a new stable idempotency key for the rollback
operation, and reversed `before`/`after` values. Reusing a key with a different
request returns HTTP 409. Replaying the same request returns its stored exact
response before revision validation, which makes lost-response retries safe.

The server serializes companion reads with writes, locks the post row, compares
the complete post-row revision and each explicit `before` value, writes only the
named fields, reads the row back, and persists the response receipt in one
database transaction. This prevents a compensation read from racing a mutation
whose client response timed out. Revision mismatch, before-value drift, or
non-exact WordPress canonicalization returns HTTP 409 and rolls the database
transaction back.

The revision covers the complete semantic `wp_posts` row except WordPress's
server-maintained modification clocks. Consequently, reversing slug/excerpt
reproduces the pre-apply revision, while unrelated title, content, ownership,
status, or other row drift still causes a conflict.

## Operational limitations

- Idempotency is guaranteed inside the 30-day receipt-retention window. Never
  retry an expired key; create a new read/proposal instead.
- To preserve atomicity and the strict field allowlist, this endpoint performs a
  narrow InnoDB update and deliberately does not run normal WordPress post-save
  hooks or create a post revision. It validates the complete row before commit
  and invalidates the WordPress post cache only after commit. External page
  caches, search indexes, sitemap caches, and webhook consumers need an explicit
  certified refresh strategy before live activation.
- A global MySQL advisory lock serializes this narrow mutation channel. This is
  intentional for the first canary capability, not a high-throughput API.
- Slugs must already be in WordPress canonical form. A uniqueness suffix or any
  other non-exact provider transformation is rejected and reverted.
- The plugin does not log Authorization headers, Application Passwords, request
  bodies, excerpts, or provider errors. Host/WAF access logs remain an operator
  responsibility and must redact authorization data.
- Plugin activation does not certify a connector. Claudia must keep the
  capability disabled until the production-like certification suite passes.
