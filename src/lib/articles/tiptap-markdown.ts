import { generateJSON, type JSONContent } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { markdownToHtml } from "@/lib/publishing/markdown-html";

// StarterKit (v3) bundles paragraph, heading, lists, blockquote, code/codeBlock,
// bold/italic/strike, link, and underline — every node and mark the editor
// toolbar can produce — so parsing HTML with it yields a document the editor
// renders faithfully.
const seedExtensions = [StarterKit];

/**
 * Builds the Tiptap JSON document the RichTextEditor seeds its content from.
 * The editor is JSON-first: initial content must be supplied via its
 * `defaultValue` prop as a JSON document — an HTML string passed through
 * `editorOptions.content` is overwritten by the wrapper's own (empty) content,
 * which is why the body rendered blank. We reuse the same Markdown -> HTML
 * converter used for publishing so the seeded content matches what we persist.
 *
 * Note: relies on the DOM (Tiptap parses HTML via the browser parser), so it
 * must only run client-side — which the editor already is (`ssr: false`).
 */
export function markdownToTiptapDoc(markdown: string | null | undefined): JSONContent {
  return generateJSON(markdownToHtml(markdown ?? ""), seedExtensions);
}

/**
 * Serializes a Tiptap document (the rich-text editor's JSON value) back to the
 * Markdown we persist in `bodyMarkdown`. Only the marks/nodes the editor toolbar
 * can produce are handled — and only those Markdown can represent — so the
 * round-trip with `markdownToHtml` stays stable.
 */

function serializeInline(nodes: JSONContent[] | undefined): string {
  if (!nodes) return "";
  return nodes.map(serializeNode).join("");
}

function serializeNode(node: JSONContent): string {
  if (node.type === "hardBreak") return "  \n";
  if (node.type !== "text") return serializeInline(node.content);

  let text = node.text ?? "";
  for (const mark of node.marks ?? []) {
    if (mark.type === "bold") text = `**${text}**`;
    else if (mark.type === "italic") text = `*${text}*`;
    else if (mark.type === "code") text = `\`${text}\``;
    else if (mark.type === "link") {
      const href = typeof mark.attrs?.href === "string" ? mark.attrs.href : "";
      text = `[${text}](${href})`;
    }
  }
  return text;
}

/** Returns the inline text of a list item's first paragraph. */
function listItemText(item: JSONContent): string {
  const paragraph = item.content?.find((child) => child.type === "paragraph");
  return serializeInline(paragraph?.content);
}

function serializeBlock(node: JSONContent): string {
  switch (node.type) {
    case "heading": {
      const level = Math.min(Math.max(Number(node.attrs?.level ?? 1), 1), 6);
      return `${"#".repeat(level)} ${serializeInline(node.content)}`;
    }
    case "bulletList":
      return (node.content ?? []).map((item) => `- ${listItemText(item)}`).join("\n");
    case "orderedList":
      return (node.content ?? [])
        .map((item, index) => `${index + 1}. ${listItemText(item)}`)
        .join("\n");
    case "blockquote":
      return (node.content ?? [])
        .map((child) => `> ${serializeInline(child.content)}`)
        .join("\n");
    case "codeBlock":
      return `\`\`\`\n${serializeInline(node.content)}\n\`\`\``;
    case "paragraph":
    default:
      return serializeInline(node.content);
  }
}

export function tiptapDocToMarkdown(doc: JSONContent | null | undefined): string {
  if (!doc?.content) return "";
  return doc.content
    .map(serializeBlock)
    .filter((block) => block.trim().length > 0)
    .join("\n\n")
    .trim();
}
