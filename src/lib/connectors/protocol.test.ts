import { describe, expect, it } from "vitest";
import {
  CONNECTOR_CERTIFICATION_CHECKS,
  CONNECTOR_SITE_ACTIVATION_CHECKS,
  CONNECTOR_MUTATION_PROTOCOL_VERSION,
  canLiveApplyCapability,
  type ConnectorCertificationCheck,
} from "@/lib/connectors/certification";
import { connectorErrorRateShouldStop } from "@/lib/connectors/protocol";

function certification(reversible: boolean) {
  const observedAt = new Date().toISOString();
  const checks = Object.fromEntries(
    CONNECTOR_CERTIFICATION_CHECKS.map((check: ConnectorCertificationCheck) => [
      check,
      {
        passed: true,
        observedAt,
        evidenceRef: `run://phase-6/${check}`,
      },
    ]),
  );
  return {
    id: "11111111-1111-4111-8111-111111111111",
    provider: "wordpress",
    capability: "article.meta.update",
    adapterVersion: "wordpress-companion-v1",
    protocolVersion: CONNECTOR_MUTATION_PROTOCOL_VERSION,
    status: "certified",
    reversible,
    evidence: {
      suiteVersion: "phase-6-v1",
      runId: "phase-6-certification",
      environment: "wordpress-staging",
      productionLike: true,
      checks,
    },
    certifiedAt: new Date(),
    revokedAt: null,
  };
}

function activation(integrationFingerprint: string) {
  const observedAt = new Date().toISOString();
  return {
    id: "22222222-2222-4222-8222-222222222222",
    integrationId: "33333333-3333-4333-8333-333333333333",
    certificationId: "11111111-1111-4111-8111-111111111111",
    status: "active",
    evidence: {
      suiteVersion: "phase-6-site-v1",
      runId: "phase-6-site-activation",
      siteRef: "https://blog.example.com",
      integrationFingerprint,
      checks: Object.fromEntries(
        CONNECTOR_SITE_ACTIVATION_CHECKS.map((check) => [
          check,
          { passed: true, observedAt, evidenceRef: `run://site/${check}` },
        ]),
      ),
    },
    activatedAt: new Date(),
    suspendedAt: null,
    revokedAt: null,
  };
}

describe("connector safety gates", () => {
  it("gates live apply by exact certified adapter and reversibility", () => {
    const reversible = certification(true);
    const integrationFingerprint = "a".repeat(64);
    const base = {
      certification: reversible,
      activation: activation(integrationFingerprint),
      provider: "wordpress",
      capability: "article.meta.update",
      adapterVersion: "wordpress-companion-v1",
      integrationId: "33333333-3333-4333-8333-333333333333",
      integrationFingerprint,
    };

    expect(canLiveApplyCapability(base)).toBe(true);
    expect(
      canLiveApplyCapability({ ...base, adapterVersion: "wordpress-companion-v2" }),
    ).toBe(false);
    expect(
      canLiveApplyCapability({
        ...base,
        certification: certification(false),
      }),
    ).toBe(false);
    expect(
      canLiveApplyCapability({
        ...base,
        certification: certification(false),
        approvalValidated: true,
      }),
    ).toBe(true);
  });

  it("opens the error-rate gate at the configured core threshold", () => {
    expect(
      connectorErrorRateShouldStop([
        { status: "verified", verificationStatus: "verified" },
        { status: "verified", verificationStatus: "verified" },
        { status: "verified", verificationStatus: "verified" },
        { status: "verified", verificationStatus: "verified" },
        { status: "verification_failed", verificationStatus: "failed" },
      ]),
    ).toBe(true);
  });
});
