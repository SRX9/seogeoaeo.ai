export const CONNECTOR_CERTIFICATION_CHECKS = [
  "authentication",
  "token_revocation",
  "tenant_isolation",
  "rate_limit",
  "retry_idempotency",
  "read_back_verification",
  "rollback",
  "partial_outage",
  "schema_drift",
  "duplicate_delivery",
  "owner_disconnect",
] as const;

export type ConnectorCertificationCheck =
  (typeof CONNECTOR_CERTIFICATION_CHECKS)[number];

export type ConnectorCertificationCheckEvidence = {
  passed: boolean;
  observedAt: string;
  evidenceRef: string;
};

export type ConnectorCertificationEvidence = {
  suiteVersion: string;
  runId: string;
  environment: string;
  productionLike: boolean;
  checks: Partial<
    Record<ConnectorCertificationCheck, ConnectorCertificationCheckEvidence>
  >;
};

export type ConnectorCertificationRecord = {
  id: string;
  provider: string;
  capability: string;
  adapterVersion: string;
  protocolVersion: string;
  status: string;
  reversible: boolean;
  evidence: unknown;
  certifiedAt: Date | null;
  revokedAt: Date | null;
};

/**
 * Production-like certification is global to an adapter/protocol pair. These
 * checks are deliberately site-specific and must be repeated for every
 * installed integration before that site may receive live writes.
 */
export const CONNECTOR_SITE_ACTIVATION_CHECKS = [
  "integration_binding",
  "credentials_current",
  "site_identity",
  "least_privilege",
  "authenticated_read",
  "canary_write",
  "read_back_verification",
  "rollback",
  "owner_authorization",
] as const;

export type ConnectorSiteActivationCheck =
  (typeof CONNECTOR_SITE_ACTIVATION_CHECKS)[number];

export type ConnectorSiteActivationCheckEvidence = {
  passed: boolean;
  observedAt: string;
  evidenceRef: string;
};

export type ConnectorSiteActivationEvidence = {
  suiteVersion: string;
  runId: string;
  siteRef: string;
  /** Non-secret digest binding the run to the installed configuration. */
  integrationFingerprint: string;
  checks: Partial<
    Record<ConnectorSiteActivationCheck, ConnectorSiteActivationCheckEvidence>
  >;
};

export type ConnectorSiteActivationRecord = {
  id: string;
  integrationId: string;
  certificationId: string;
  status: string;
  evidence: unknown;
  activatedAt: Date | null;
  suspendedAt: Date | null;
  revokedAt: Date | null;
};

export const CONNECTOR_MUTATION_PROTOCOL_VERSION = "claudia-mutation-v1";

const EVIDENCE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1_000;
const EVIDENCE_MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;

function isFreshUtcDate(value: string, now = Date.now()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    return false;
  }
  const timestamp = Date.parse(value);
  return (
    Number.isFinite(timestamp) &&
    timestamp <= now + EVIDENCE_MAX_FUTURE_SKEW_MS &&
    timestamp >= now - EVIDENCE_MAX_AGE_MS
  );
}

export function validateConnectorCertificationEvidence(
  value: unknown,
):
  | { valid: true; evidence: ConnectorCertificationEvidence }
  | { valid: false; missing: string[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { valid: false, missing: ["evidence"] };
  }

  const candidate = value as Partial<ConnectorCertificationEvidence>;
  const missing: string[] = [];
  if (!candidate.suiteVersion?.trim()) missing.push("suiteVersion");
  if (!candidate.runId?.trim()) missing.push("runId");
  if (!candidate.environment?.trim()) missing.push("environment");
  if (candidate.productionLike !== true) missing.push("productionLike");

  const checks = candidate.checks;
  for (const check of CONNECTOR_CERTIFICATION_CHECKS) {
    const evidence = checks?.[check];
    if (
      !evidence ||
      evidence.passed !== true ||
      !evidence.evidenceRef?.trim() ||
      !evidence.observedAt ||
      !isFreshUtcDate(evidence.observedAt)
    ) {
      missing.push(check);
    }
  }

  if (missing.length > 0) return { valid: false, missing };
  return { valid: true, evidence: candidate as ConnectorCertificationEvidence };
}

export function validateConnectorSiteActivationEvidence(
  value: unknown,
):
  | { valid: true; evidence: ConnectorSiteActivationEvidence }
  | { valid: false; missing: string[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { valid: false, missing: ["evidence"] };
  }

  const candidate = value as Partial<ConnectorSiteActivationEvidence>;
  const missing: string[] = [];
  if (!candidate.suiteVersion?.trim()) missing.push("suiteVersion");
  if (!candidate.runId?.trim()) missing.push("runId");
  if (!candidate.siteRef?.trim()) missing.push("siteRef");
  if (!/^[a-f0-9]{64}$/.test(candidate.integrationFingerprint ?? "")) {
    missing.push("integrationFingerprint");
  }

  for (const check of CONNECTOR_SITE_ACTIVATION_CHECKS) {
    const evidence = candidate.checks?.[check];
    if (
      !evidence ||
      evidence.passed !== true ||
      !evidence.evidenceRef?.trim() ||
      !evidence.observedAt ||
      !isFreshUtcDate(evidence.observedAt)
    ) {
      missing.push(check);
    }
  }

  if (missing.length > 0) return { valid: false, missing };
  return { valid: true, evidence: candidate as ConnectorSiteActivationEvidence };
}

export function isConnectorSiteActivationActive(
  activation: ConnectorSiteActivationRecord | null | undefined,
): boolean {
  if (
    !activation ||
    activation.status !== "active" ||
    !activation.activatedAt ||
    activation.suspendedAt ||
    activation.revokedAt
  ) {
    return false;
  }
  return validateConnectorSiteActivationEvidence(activation.evidence).valid;
}

export function isConnectorCapabilityCertified(input: {
  certification: ConnectorCertificationRecord | null | undefined;
  provider: string;
  capability: string;
  adapterVersion: string;
}): boolean {
  const certification = input.certification;
  if (
    !certification ||
    certification.provider !== input.provider ||
    certification.capability !== input.capability ||
    certification.adapterVersion !== input.adapterVersion ||
    certification.status !== "certified" ||
    certification.protocolVersion !== CONNECTOR_MUTATION_PROTOCOL_VERSION ||
    !certification.adapterVersion.trim() ||
    !certification.certifiedAt ||
    certification.certifiedAt.getTime() < Date.now() - EVIDENCE_MAX_AGE_MS ||
    certification.certifiedAt.getTime() > Date.now() + EVIDENCE_MAX_FUTURE_SKEW_MS ||
    certification.revokedAt
  ) {
    return false;
  }

  const evidence = validateConnectorCertificationEvidence(certification.evidence);
  return evidence.valid;
}

export function canLiveApplyCapability(input: {
  certification: ConnectorCertificationRecord | null | undefined;
  activation: ConnectorSiteActivationRecord | null | undefined;
  provider: string;
  capability: string;
  adapterVersion: string;
  integrationId: string;
  integrationFingerprint: string;
  approvalValidated?: boolean;
}): boolean {
  if (!isConnectorCapabilityCertified(input)) return false;
  const activation = input.activation;
  if (!activation || !isConnectorSiteActivationActive(activation)) return false;
  if (
    activation.integrationId !== input.integrationId ||
    activation.certificationId !== input.certification!.id
  ) {
    return false;
  }
  const siteEvidence = validateConnectorSiteActivationEvidence(
    activation.evidence,
  );
  if (
    !siteEvidence.valid ||
    siteEvidence.evidence.integrationFingerprint !== input.integrationFingerprint
  ) {
    return false;
  }

  // An irreversible capability can exist in the registry, but it can never be
  // autonomous. A fresh, proposal-bound owner approval is required each time.
  return input.certification!.reversible || input.approvalValidated === true;
}
