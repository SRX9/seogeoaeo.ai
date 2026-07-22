import { describe, expect, it } from "vitest";
import {
  validateContentMetadata,
  validateInternalLinkTargets,
} from "@/lib/grounding/content-validation";
import { evaluateOriginality } from "@/lib/grounding/originality";
import {
  aggregatePublicationGate,
  passesFastAutoPublishGate,
  publicationGateCheck,
  REQUIRED_PUBLICATION_GATES,
} from "@/lib/grounding/publication-gate";
import { evaluateContentRisk } from "@/lib/grounding/risk-policy";

describe("Phase 3 content gates", () => {
  it("classifies every policy category and fail-closes high-risk content", () => {
    const cases = {
      medical_health: "Medical treatment for diabetes patients",
      legal: "Legal advice from an attorney",
      financial: "Financial advice for stock investments",
      safety: "Electrical safety and injury prevention",
      regulated_products: "Rules for tobacco and cannabis products",
      employment_discrimination: "Employment law and workplace discrimination",
      minors: "Parental consent and child safety",
      reputational_allegations: "The company was accused of deceptive practices",
      comparative_claims: "Our platform is faster than its competitors",
    } as const;

    for (const [category, body] of Object.entries(cases)) {
      const result = evaluateContentRisk({ title: "Guide", body });
      expect(result.categories).toContain(category);
      if (category !== "comparative_claims") {
        expect(result.riskLevel).toBe("high");
        expect(result.humanReviewRequired).toBe(true);
        expect(result.minimumSourceTier).toBe("tier_1_primary");
        expect(result.passed).toBe(false);
      }
    }

    expect(
      evaluateContentRisk({
        title: "Medical treatment overview",
        body: "A physician explains diabetes treatment evidence.",
        strongestSourceTier: "tier_1_primary",
        humanReviewApproved: true,
      }).passed,
    ).toBe(true);

    const unknownMedication = evaluateContentRisk({
      title: "Dosage note",
      body: "Double warfarin tomorrow.",
    });
    expect(unknownMedication.riskLevel).toBe("high");
    expect(unknownMedication.humanReviewRequired).toBe(true);
    expect(unknownMedication.unsupportedAdviceDetected).toBe(true);
  });

  it("blocks obvious cannibalization but allows content-present information gain", () => {
    const proposed = {
      title: "Invoice reminder email guide",
      body: "Send invoice reminder emails before and after an invoice is due. Keep the message concise and include the amount and payment link.",
      keywords: ["invoice reminder emails"],
      intent: "how-to",
    };
    const existingBrandContent = [
      {
        id: "existing-1",
        title: "Guide to invoice reminder emails",
        body: "Send invoice reminder emails before and after an invoice is due. Keep each message concise and include the amount and payment link.",
        keywords: ["invoice reminder emails"],
        intent: "how-to",
      },
    ];

    expect(evaluateOriginality({ proposed, existingBrandContent }).passed).toBe(false);
    expect(evaluateOriginality({ proposed, existingBrandContent: [] }).passed).toBe(false);
    const distinct = evaluateOriginality({
      proposed: {
        title: "What the 2026 payment-timing cohort revealed",
        body: "Our 2026 payment data shows Tuesday reminders clear invoices 18% sooner. The timing-confidence matrix separates invoice age, account history, and delivery confidence into a three-step decision framework.",
        keywords: ["payment timing cohort"],
        intent: "research",
        distinctThesis: "Tuesday reminders clear invoices 18% sooner",
        originalBrandEvidence: ["Our 2026 payment data shows Tuesday reminders clear invoices 18% sooner"],
        usefulFramework: "timing confidence matrix three step decision framework",
      },
      existingBrandContent,
    });
    expect(distinct.passed).toBe(true);
    expect(distinct.informationGainSignals).toContain("original_brand_evidence");
  });

  it("rejects unknown internal targets and unsupported metadata claims", () => {
    const links = validateInternalLinkTargets({
      siteOrigin: "https://example.com",
      recommendations: [{ target: "/known/" }, { target: "/invented" }],
      knownTargets: [{ target: "https://example.com/known" }],
    });
    expect(links.validTargets).toEqual(["/known/"]);
    expect(links.invalidTargets).toEqual([{ target: "/invented", reason: "unknown" }]);

    const metadata = validateContentMetadata({
      metadata: {
        title: "The best invoice platform",
        description: "Teams get paid 47% faster.",
      },
      supportedClaims: [],
    });
    expect(metadata.passed).toBe(false);
    expect(metadata.findings.map((finding) => finding.kind)).toEqual([
      "superlative",
      "statistic",
    ]);
  });

  it("hashes the final content and blocks missing, errored, or unversioned required gates", async () => {
    const passedGates = Object.fromEntries(
      REQUIRED_PUBLICATION_GATES.map((gate) => [gate, publicationGateCheck(true, `${gate}.v1`)]),
    );
    const finalContent = {
      title: "Grounded guide",
      slug: "grounded-guide",
      metaDescription: "A grounded guide.",
      tags: ["research"],
      bodyMarkdown: "Verified content.",
    };
    const passed = await aggregatePublicationGate({ finalContent, gates: passedGates });
    expect(passed.passed).toBe(true);
    expect(passed.finalContentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.keys(passed.evaluatorVersions)).toHaveLength(
      REQUIRED_PUBLICATION_GATES.length + 1,
    );

    const failed = await aggregatePublicationGate({
      finalContent,
      gates: {
        ...passedGates,
        citation_validity_coverage: {
          status: "error",
          evaluatorVersion: "citations.v1",
        },
        metadata_validity: { status: "passed", evaluatorVersion: "" },
        owner_policy: undefined,
      },
    });
    expect(failed.passed).toBe(false);
    expect(failed.gates.citation_validity_coverage.status).toBe("error");
    expect(failed.gates.metadata_validity.status).toBe("error");
    expect(failed.gates.owner_policy.status).toBe("missing");
  });

  it("lets fast mode tolerate editorial gates but never factual or safety gates", async () => {
    const gates = Object.fromEntries(
      REQUIRED_PUBLICATION_GATES.map((gate) => [gate, publicationGateCheck(true, `${gate}.v1`)]),
    );
    const finalContent = {
      title: "Fast publishing guide",
      slug: "fast-publishing-guide",
      metaDescription: "A guide.",
      tags: [],
      bodyMarkdown: "Grounded content.",
    };
    const editorialFailure = await aggregatePublicationGate({
      finalContent,
      gates: {
        ...gates,
        style_structure: publicationGateCheck(false, "style.v1", ["Minor style issue"]),
        metadata_validity: publicationGateCheck(false, "metadata.v1", ["Weak metadata"]),
      },
    });
    expect(editorialFailure.passed).toBe(false);
    expect(passesFastAutoPublishGate(editorialFailure)).toBe(true);

    const factualFailure = await aggregatePublicationGate({
      finalContent,
      gates: {
        ...gates,
        grounded_material_claims: publicationGateCheck(false, "grounding.v1", [
          "Unsupported material claim",
        ]),
      },
    });
    expect(passesFastAutoPublishGate(factualFailure)).toBe(false);
  });
});
