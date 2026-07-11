import { toMarkdown, type ReportModel } from "./report";

/**
 * V6.2: PDF report. Reuses the V6.1 report model + a print stylesheet and
 * renders to PDF via Cloudflare Browser Rendering (headless Chromium), rather
 * than porting ReportLab. Gauge/table colors follow the 80/60/40 thresholds
 * from generate_pdf_report.py; palette from templates/geo-report-style.css.
 */

export interface ReportBrand {
  name?: string;
  primary?: string; // hex
  logo?: string;
}

/** Gauge color band: green 80+ · blue 60-79 · amber 40-59 · red <40. */
export function gaugeColor(score: number | null): string {
  if (score == null) return "#94a3b8"; // slate: not scored
  if (score >= 80) return "#16a34a";
  if (score >= 60) return "#2563eb";
  if (score >= 40) return "#d97706";
  return "#dc2626";
}

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

function scoreRows(model: ReportModel): string {
  return model.subScores
    .map((s) => {
      const color = gaugeColor(s.score);
      return `<tr><td>${esc(s.label)}</td><td style="color:${color};font-weight:600">${s.score == null ? "N/A" : Math.round(s.score)}</td></tr>`;
    })
    .join("");
}

/** Self-contained HTML for the report (also the PDF source). */
export function reportHtml(model: ReportModel, brand: ReportBrand = {}): string {
  const primary = brand.primary ?? "#0f172a";
  const coral = "#ff6b57";
  const gauge = gaugeColor(model.overall);
  const bodyHtml = markdownToHtml(toMarkdown(model));

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    :root{--primary:${primary};--coral:${coral}}
    *{box-sizing:border-box}
    body{font:14px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;margin:0}
    .cover{background:linear-gradient(135deg,var(--primary),#1e293b);color:#fff;padding:64px 48px;page-break-after:always}
    .cover h1{font-size:30px;margin:0 0 8px}
    .gauge{width:160px;height:160px;border-radius:50%;display:flex;align-items:center;justify-content:center;
      font-size:44px;font-weight:700;color:#fff;background:${gauge};margin:32px 0}
    .band{color:var(--coral);font-weight:600}
    main{padding:32px 48px}
    h2{color:var(--primary);border-bottom:2px solid #e2e8f0;padding-bottom:4px;margin-top:28px}
    table{border-collapse:collapse;width:100%;margin:8px 0}
    td,th{border:1px solid #e2e8f0;padding:6px 10px;text-align:left}
    code{background:#f1f5f9;padding:2px 4px;border-radius:4px}
    ul{padding-left:20px}
  </style></head><body>
  <div class="cover">
    ${brand.logo ? `<img src="${esc(brand.logo)}" alt="" height="40"/>` : ""}
    <h1>${esc(brand.name ?? "Visibility report")}</h1>
    <p>${esc(model.site)} · ${model.generatedAt.slice(0, 10)}</p>
    <div class="gauge">${model.overall == null ? "N/A" : Math.round(model.overall)}</div>
    <p class="band">${esc(model.band)}</p>
    <table style="color:#fff;border-color:#334155;max-width:360px">${scoreRows(model)}</table>
  </div>
  <main>${bodyHtml}</main>
  </body></html>`;
}

/** Minimal Markdown → HTML (headings, lists, bold, code) for the report body. */
function markdownToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inList = false;
  const inline = (s: string) =>
    esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`(.+?)`/g, "<code>$1</code>");
  for (const raw of lines) {
    const l = raw.trimEnd();
    const li = /^[-*]\s+(.*)/.exec(l);
    if (li) {
      if (!inList) (out.push("<ul>"), (inList = true));
      out.push(`<li>${inline(li[1])}</li>`);
      continue;
    }
    if (inList) (out.push("</ul>"), (inList = false));
    const h = /^(#{1,4})\s+(.*)/.exec(l);
    if (h) out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
    else if (l) out.push(`<p>${inline(l)}</p>`);
  }
  if (inList) out.push("</ul>");
  return out.join("");
}

/**
 * Render the report to PDF. Uses a Cloudflare Browser Rendering binding (a
 * `@cloudflare/puppeteer`-compatible launcher) when provided; otherwise returns
 * the HTML bytes so the download still works (browser prints to PDF).
 */
export async function renderReportPdf(
  model: ReportModel,
  opts: { brand?: ReportBrand; browser?: { launch: () => Promise<PuppeteerBrowser> } } = {},
): Promise<{ body: Uint8Array; contentType: string }> {
  const html = reportHtml(model, opts.brand);
  if (!opts.browser) {
    return { body: new TextEncoder().encode(html), contentType: "text/html; charset=utf-8" };
  }
  const browser = await opts.browser.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({ format: "A4", printBackground: true });
    return { body: pdf, contentType: "application/pdf" };
  } finally {
    await browser.close();
  }
}

interface PuppeteerPage {
  setContent(html: string, opts?: { waitUntil?: string }): Promise<void>;
  pdf(opts?: { format?: string; printBackground?: boolean }): Promise<Uint8Array>;
}
interface PuppeteerBrowser {
  newPage(): Promise<PuppeteerPage>;
  close(): Promise<void>;
}
