"use client";

import { Button, Input } from "@heroui/react";
import { useState, type KeyboardEvent } from "react";
import { XIcon } from "@/components/icons";

function parseTags(value: string): string[] {
  return value.split(",").map((tag) => tag.trim()).filter(Boolean);
}

function dedupe(tags: string[]): string[] {
  const seen = new Set<string>();
  return tags.filter((tag) => {
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function TagInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  id?: string;
}) {
  const [draft, setDraft] = useState("");
  const tags = parseTags(value);

  function commit(next: string[]) {
    onChange(dedupe(next).join(", "));
  }

  function addDraft() {
    const parts = parseTags(draft);
    if (parts.length > 0) commit([...tags, ...parts]);
    setDraft("");
  }

  function removeAt(index: number) {
    commit(tags.filter((_, tagIndex) => tagIndex !== index));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      if (draft.trim()) {
        event.preventDefault();
        event.stopPropagation();
        addDraft();
      } else if (event.key === ",") {
        event.preventDefault();
      }
    } else if (event.key === "Backspace" && !draft && tags.length > 0) {
      event.preventDefault();
      removeAt(tags.length - 1);
    }
  }

  return (
    <div
      data-tag-input
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) addDraft();
      }}
      className="flex min-h-11 flex-wrap items-center gap-2"
    >
      {tags.map((tag, index) => (
        <span key={tag.toLowerCase()} className="inline-flex items-center gap-1 text-sm font-medium text-accent">
          {tag}
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            aria-label={`Remove ${tag}`}
            onPress={() => removeAt(index)}
          >
            <XIcon className="size-3" />
          </Button>
        </span>
      ))}
      <Input
        id={id}
        aria-label={ariaLabel}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={tags.length === 0 ? placeholder : "Add another…"}
        variant="secondary"
        className="min-w-[12rem] flex-1"
      />
    </div>
  );
}
