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
import { cn } from "@/lib/cn";

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
  /** Styling hook for the surrounding editorial workspace. */
  className?: string;
  /** Preview mode keeps the document focusable while preventing edits. */
  isReadOnly?: boolean;
};

export function ArticleBodyEditor({
  defaultMarkdown,
  onChange,
  className,
  isReadOnly = false,
}: ArticleBodyEditorProps) {
  const initialDoc = useMemo(() => markdownToTiptapDoc(defaultMarkdown), [defaultMarkdown]);

  return (
    <div className={cn("overflow-hidden rounded-2xl bg-surface", className)}>
      <RichTextEditor
        className="w-full [--field-border:var(--separator)]"
        defaultValue={initialDoc}
        isReadOnly={isReadOnly}
        placeholder="Write the article body…"
        onValueChange={(value: JSONContent) => onChange(tiptapDocToMarkdown(value))}
      >
        <RichTextEditor.Shell>
          {!isReadOnly ? (
            <RichTextEditor.Toolbar aria-label="Article formatting" className="border-b border-separator/60">
              <RichTextEditor.ToolbarGroup>
                <RichTextEditor.ToggleButton command="bold" tooltip="Bold"><BoldIcon className="size-4" /></RichTextEditor.ToggleButton>
                <RichTextEditor.ToggleButton command="italic" tooltip="Italic"><ItalicIcon className="size-4" /></RichTextEditor.ToggleButton>
                <RichTextEditor.ToggleButton command="underline" tooltip="Underline"><span className="text-sm font-medium underline underline-offset-2">U</span></RichTextEditor.ToggleButton>
                <RichTextEditor.ToggleButton command="strike" tooltip="Strikethrough"><span className="text-sm font-medium line-through">S</span></RichTextEditor.ToggleButton>
                <RichTextEditor.ToggleButton command="code" tooltip="Inline code"><InlineCodeIcon className="size-4" /></RichTextEditor.ToggleButton>
              </RichTextEditor.ToolbarGroup>
              <RichTextEditor.ToolbarGroup>
                {headings.map((heading) => (
                  <RichTextEditor.ToggleButton key={heading.command} command={heading.command} tooltip={`Heading ${heading.label.slice(1)}`}>
                    <span className="text-xs font-semibold">{heading.label}</span>
                  </RichTextEditor.ToggleButton>
                ))}
              </RichTextEditor.ToolbarGroup>
              <RichTextEditor.ToolbarGroup>
                <RichTextEditor.ToggleButton command="bulletList" tooltip="Bulleted list"><BulletListIcon className="size-4" /></RichTextEditor.ToggleButton>
                <RichTextEditor.ToggleButton command="orderedList" tooltip="Numbered list"><OrderedListIcon className="size-4" /></RichTextEditor.ToggleButton>
                <RichTextEditor.ToggleButton command="blockquote" tooltip="Quote"><QuoteIcon className="size-4" /></RichTextEditor.ToggleButton>
                <RichTextEditor.ToggleButton command="codeBlock" tooltip="Code block"><CodeBlockIcon className="size-4" /></RichTextEditor.ToggleButton>
              </RichTextEditor.ToolbarGroup>
              <RichTextEditor.ToolbarGroup>
                <RichTextEditor.LinkPopover>
                  <RichTextEditor.LinkPopover.Trigger><LinkIcon className="size-4" /></RichTextEditor.LinkPopover.Trigger>
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
          ) : null}
          <RichTextEditor.Content className="min-h-[360px] sm:min-h-[460px]" />
          {!isReadOnly ? (
            <RichTextEditor.BubbleMenu>
              <RichTextEditor.ToggleButton command="bold" tooltip="Bold"><BoldIcon className="size-4" /></RichTextEditor.ToggleButton>
              <RichTextEditor.ToggleButton command="italic" tooltip="Italic"><ItalicIcon className="size-4" /></RichTextEditor.ToggleButton>
              <RichTextEditor.ToggleButton command="code" tooltip="Inline code"><InlineCodeIcon className="size-4" /></RichTextEditor.ToggleButton>
            </RichTextEditor.BubbleMenu>
          ) : null}
          <RichTextEditor.Footer>
            <span className="text-xs text-muted">{isReadOnly ? "Preview" : "Saved as Markdown"}</span>
            <RichTextEditor.CharacterCount showWords />
          </RichTextEditor.Footer>
        </RichTextEditor.Shell>
      </RichTextEditor>
    </div>
  );
}
