import { gaugeColor } from "@/lib/visibility/report-pdf";
import { scoreBand } from "@/lib/visibility/display";

/**
 * V8.6: opt-in public score badge (SVG). Every proud customer is a referral.
 * the badge links back to the free checker. Colors follow the 80/60/40 bands.
 */
export function renderBadge(domain: string, score: number): string {
  const color = gaugeColor(score);
  const band = scoreBand(score);
  const safeDomain = domain.replace(/[<>&"]/g, "").slice(0, 40);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="48" role="img" aria-label="AI Visibility ${score}">
  <rect width="220" height="48" rx="6" fill="#0f172a"/>
  <text x="14" y="20" fill="#94a3b8" font-family="system-ui,sans-serif" font-size="10">AI VISIBILITY</text>
  <text x="14" y="38" fill="#e2e8f0" font-family="system-ui,sans-serif" font-size="12">${safeDomain}</text>
  <rect x="150" y="8" width="58" height="32" rx="4" fill="${color}"/>
  <text x="179" y="26" fill="#fff" font-family="system-ui,sans-serif" font-size="16" font-weight="700" text-anchor="middle">${Math.round(score)}</text>
  <text x="179" y="37" fill="#fff" font-family="system-ui,sans-serif" font-size="7" text-anchor="middle">${band.toUpperCase()}</text>
</svg>`;
}
