"use client";

import { RichTextEditor } from "@heroui-pro/react";
import type { JSONContent } from "@tiptap/core";
import { useMemo } from "react";
import {
  BoldIcon,
  BulletListIcon,
  CodeBlockIcon,
  InlineCodeIcon,
  ItalicIcon,
  LinkIcon,
  OrderedListIcon,
  QuoteIcon,
} from "@/components/icons";
import { markdownToTiptapDoc, tiptapDocToMarkdown } from "@/lib/articles/tiptap-markdown";

const headings = [
  { command: "heading-1", label: "H1" },
  { command: "heading-2", label: "H2" },
  { command: "heading-3", label: "H3" },
] as const;

type ArticleBodyEditorProps = {
  /** Initial markdown used to seed the editor's content (uncontrolled internally). */
  defaultMarkdown: string;
  /** Called with the latest markdown whenever the document changes. */
  onChange: (markdown: string) => void;
};

export function ArticleBodyEditor({ defaultMarkdown, onChange }: ArticleBodyEditorProps) {
  // Seed the uncontrolled editor once from the article's Markdown. The editor is
  // JSON-first, so initial content goes through `defaultValue` as a Tiptap doc.
  const initialDoc = useMemo(() => markdownToTiptapDoc(defaultMarkdown), [defaultMarkdown]);

  return (
    <div className="overflow-hidden border-y border-separator/70 bg-surface/40">
      <RichTextEditor
        className="w-full"
        defaultValue={initialDoc}
        placeholder="Write the article body…"
        onValueChange={(value: JSONContent) => onChange(tiptapDocToMarkdown(value))}
      >
        <RichTextEditor.Shell>
          <RichTextEditor.Toolbar className="border-b border-border/40">
            <RichTextEditor.ToolbarGroup>
              <RichTextEditor.ToggleButton command="bold" tooltip="Bold">
                <BoldIcon className="size-4" />
              </RichTextEditor.ToggleButton>
              <RichTextEditor.ToggleButton command="italic" tooltip="Italic">
                <ItalicIcon className="size-4" />
              </RichTextEditor.ToggleButton>
              <RichTextEditor.ToggleButton command="code" tooltip="Inline code">
                <InlineCodeIcon className="size-4" />
              </RichTextEditor.ToggleButton>
            </RichTextEditor.ToolbarGroup>
            <RichTextEditor.ToolbarGroup>
              {headings.map((heading) => (
                <RichTextEditor.ToggleButton
                  key={heading.command}
                  command={heading.command}
                  tooltip={`Heading ${heading.label.slice(1)}`}
                >
                  <span className="text-xs font-semibold">{heading.label}</span>
                </RichTextEditor.ToggleButton>
              ))}
            </RichTextEditor.ToolbarGroup>
            <RichTextEditor.ToolbarGroup>
              <RichTextEditor.ToggleButton command="bulletList" tooltip="Bulleted list">
                <BulletListIcon className="size-4" />
              </RichTextEditor.ToggleButton>
              <RichTextEditor.ToggleButton command="orderedList" tooltip="Numbered list">
                <OrderedListIcon className="size-4" />
              </RichTextEditor.ToggleButton>
              <RichTextEditor.ToggleButton command="blockquote" tooltip="Quote">
                <QuoteIcon className="size-4" />
              </RichTextEditor.ToggleButton>
              <RichTextEditor.ToggleButton command="codeBlock" tooltip="Code block">
                <CodeBlockIcon className="size-4" />
              </RichTextEditor.ToggleButton>
            </RichTextEditor.ToolbarGroup>
            <RichTextEditor.ToolbarGroup>
              <RichTextEditor.LinkPopover>
                <RichTextEditor.LinkPopover.Trigger>
                  <LinkIcon className="size-4" />
                </RichTextEditor.LinkPopover.Trigger>
                <RichTextEditor.LinkPopover.Content>
                  <RichTextEditor.LinkPopover.Input />
                  <RichTextEditor.LinkPopover.Actions>
                    <RichTextEditor.LinkPopover.UnsetButton />
                    <RichTextEditor.LinkPopover.ApplyButton />
                  </RichTextEditor.LinkPopover.Actions>
                </RichTextEditor.LinkPopover.Content>
              </RichTextEditor.LinkPopover>
            </RichTextEditor.ToolbarGroup>
          </RichTextEditor.Toolbar>
          <RichTextEditor.Content className="min-h-[360px]" />
          <RichTextEditor.BubbleMenu>
            <RichTextEditor.ToggleButton command="bold" tooltip="Bold">
              <BoldIcon className="size-4" />
            </RichTextEditor.ToggleButton>
            <RichTextEditor.ToggleButton command="italic" tooltip="Italic">
              <ItalicIcon className="size-4" />
            </RichTextEditor.ToggleButton>
            <RichTextEditor.ToggleButton command="code" tooltip="Inline code">
              <InlineCodeIcon className="size-4" />
            </RichTextEditor.ToggleButton>
          </RichTextEditor.BubbleMenu>
          <RichTextEditor.Footer>
            <span className="text-xs text-muted">Saved as Markdown</span>
            <RichTextEditor.CharacterCount showWords />
          </RichTextEditor.Footer>
        </RichTextEditor.Shell>
      </RichTextEditor>
    </div>
  );
}
