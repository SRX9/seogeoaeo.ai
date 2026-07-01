# Publishing integrations guide

This guide explains what each publishing integration needs, how users should set
it up, and how to troubleshoot common connection issues.

## Quick setup

1. Open **Settings -> Integrations**.
2. Choose a destination.
3. Enter only the fields shown for that provider.
4. Click **Save connection**.
5. Click **Enable** once the required setup is complete.
6. Publish or export from an approved article.

Users can also pick one destination during onboarding. Onboarding only enables a
provider when all required fields and secrets are present. Any destination marked
as gated should be finished later in Settings after OAuth or legacy access support
is available.

## Security model

- Secret values are stored only in `integration_secrets`.
- Secrets are encrypted at rest with AES-GCM.
- Secret values are never returned to the browser after saving.
- The UI only receives per-secret saved flags, so it can show "Saved, enter to
  replace".
- Clearing an integration disables it, deletes encrypted secret rows, and removes
  non-secret config.

## Available destinations

| Destination | Required setup | Optional setup | Notes |
| --- | --- | --- | --- |
| Markdown export | None | None | Enable it to make approved articles downloadable as Markdown files. |
| Generic webhook | Webhook URL | Bearer token, signing secret | Sends article JSON to the configured HTTPS endpoint. Bearer tokens are sent as `Authorization: Bearer ...`; signing secrets produce an `x-seo-ai-signature` HMAC header. |
| Dev.to | Dev.to API key | None | The key is sent in Dev.to's `api-key` header. |
| Hashnode | Publication ID, personal access token | None | Publishes through Hashnode's authenticated GraphQL `publishPost` flow. |
| WordPress | Site URL, username, application password | None | Publishes through `/wp-json/wp/v2/posts` with authenticated create access. |
| Ghost | Admin API URL, Admin API key | None | The Admin API key must use `id:secret` format. |

## Gated destinations

These destinations are shown accurately, but users cannot enter generic API keys
for them because the current product does not implement the required OAuth or
legacy-token flows.

| Destination | Why it is gated |
| --- | --- |
| Medium | New integration tokens are not generally available; legacy token support needs a dedicated flow. |
| Reddit | Posting requires a registered Reddit app and user-authorized OAuth credentials. |
| X post | Posting requires X API access and authenticated post-creation scopes. |
| X article | Long-form publishing requires approved X API access and OAuth. |
| LinkedIn post | Posting requires LinkedIn API access and member or organization posting scopes. |
| LinkedIn article | Article publishing requires LinkedIn API access and publishing scopes. |

## Provider steps

### Markdown export

1. Open **Settings -> Integrations**.
2. Find **Markdown export**.
3. Click **Enable**.

No external account or credentials are required.

### Generic webhook

1. Create an HTTPS endpoint that accepts article JSON payloads.
2. Paste the endpoint into **Webhook URL**.
3. Optionally add a bearer token if the endpoint checks the `Authorization`
   header.
4. Optionally add a signing secret if the endpoint verifies HMAC signatures.
5. Save and enable the integration.

Use the signing secret when the receiver needs to prove that payloads came from
this app. Rotate the bearer token or signing secret if it has been exposed.

### Dev.to

1. Create or copy a Dev.to API key from the user's Dev.to account settings.
2. Paste it into **Dev.to API key**.
3. Save and enable the integration.

If publishing fails, confirm the key belongs to the correct account and still has
article publishing access.

### Hashnode

1. Find the Hashnode publication ID for the target publication.
2. Create or copy a personal access token with publishing access.
3. Paste the ID into **Publication ID**.
4. Paste the token into **Personal access token**.
5. Save and enable the integration.

If publishing fails, confirm the token can publish to the selected publication.

### WordPress

1. Confirm the WordPress site exposes the REST API.
2. Create an application password for a user that can create posts.
3. Paste the public site URL into **Site URL**.
4. Paste the WordPress username into **WordPress username**.
5. Paste the application password into **Application password**.
6. Save and enable the integration.

Use the base site URL, for example `https://blog.example.com`, not the posts API
path. The adapter builds the `/wp-json/wp/v2/posts` endpoint.

### Ghost

1. In Ghost Admin, create or open an integration with Admin API access.
2. Copy the Admin API URL.
3. Copy the Admin API key.
4. Paste the URL into **Admin API URL**.
5. Paste the key into **Admin API key (id:secret)**.
6. Save and enable the integration.

The Admin API key must include the colon-separated ID and secret. A Content API
key is not enough for publishing.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Enable button is disabled | A required field or required secret is missing. Fill the fields listed below the buttons. |
| Secret looks blank after saving | This is expected. Saved secrets are masked and can only be replaced, not viewed. |
| Publish says setup is incomplete | Reopen Settings and confirm the integration is enabled and all required fields are still present. |
| Provider returns unauthorized | Replace the saved secret, confirm the user has publish permissions, and check whether the provider rotated or revoked the credential. |
| Webhook does not receive posts | Confirm the URL is HTTPS, reachable from the public internet, and accepts JSON `POST` requests. |
| WordPress publish fails | Confirm REST API access, username, application password, and post creation permission. |
| Ghost publish fails | Confirm the Admin API URL and that the key is an Admin API key in `id:secret` format. |

## Support checklist

When a user asks for help, collect:

1. Destination name.
2. Whether the integration is enabled.
3. Whether Settings shows any missing required fields.
4. Approximate publish time and article title.
5. Provider-side error message if visible.

Never ask a user to send raw API keys, application passwords, OAuth tokens, or
Ghost Admin API secrets. Ask them to replace the saved secret in Settings instead.
