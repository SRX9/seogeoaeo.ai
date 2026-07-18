export type ConnectorProvider = "wordpress";

export type ConnectorCapability = "article.meta.update";

export type ConnectorFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type ConnectorContext<TConfig, TSecrets> = {
  config: TConfig;
  secrets: TSecrets;
  remoteResourceId: string;
  idempotencyKey: string;
  /** Immutable server-issued revision captured with the proposal. */
  expectedRevision?: string;
  fetch: ConnectorFetch;
};

export type ConnectorDiffEntry<TField extends string = string> = {
  field: TField;
  before: string;
  after: string;
};

export type ConnectorVerificationMismatch<TField extends string = string> = {
  field: TField;
  expected: string;
  actual: string;
};

export type ConnectorVerification<TField extends string = string> =
  | { ok: true }
  | {
      ok: false;
      unexpected: ConnectorVerificationMismatch<TField>[];
    };

export type ConnectorRollbackResult<TState, TField extends string = string> =
  | {
      status: "reverted";
      state: TState;
    }
  | {
      status: "manual_recovery_required";
      reason: "remote_drift" | "rollback_verification_failed";
      wrote: boolean;
      state: TState;
      unexpected: ConnectorVerificationMismatch<TField>[];
    };

export type ConnectorErrorCode =
  | "invalid_configuration"
  | "invalid_mutation"
  | "authentication_revoked"
  | "rate_limited"
  | "provider_unavailable"
  | "network_error"
  | "revision_conflict"
  | "schema_drift"
  | "request_rejected";

/**
 * Sanitized, stable connector failure safe to persist. Provider response bodies
 * and transport exception messages are deliberately excluded because either
 * can contain credentials or attacker-controlled content.
 */
export class ConnectorAdapterError extends Error {
  constructor(
    message: string,
    readonly code: ConnectorErrorCode,
    readonly retryable: boolean,
    readonly status: number | null = null,
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = "ConnectorAdapterError";
  }
}

export type ConnectorAdapter<
  TConfig,
  TSecrets,
  TRawState,
  TState,
  TDesiredState,
  TField extends string,
> = {
  provider: ConnectorProvider;
  capability: ConnectorCapability;
  version: string;
  read(context: ConnectorContext<TConfig, TSecrets>): Promise<TRawState>;
  normalize(raw: TRawState): TState;
  constructDiff(
    current: TState,
    desired: TDesiredState,
  ): ConnectorDiffEntry<TField>[];
  write(
    context: ConnectorContext<TConfig, TSecrets>,
    diff: readonly ConnectorDiffEntry<TField>[],
  ): Promise<TState>;
  verify(
    diff: readonly ConnectorDiffEntry<TField>[],
    actual: TState,
  ): ConnectorVerification<TField>;
  rollback(
    context: ConnectorContext<TConfig, TSecrets>,
    diff: readonly ConnectorDiffEntry<TField>[],
  ): Promise<ConnectorRollbackResult<TState, TField>>;
};
