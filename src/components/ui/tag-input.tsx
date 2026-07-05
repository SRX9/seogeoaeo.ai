"use client";

import { useState, type KeyboardEvent } from "react";

/**
 * Tag-style editor over a comma-separated string. It *looks* like tags — each
 * value is a small rounded-lg block you can remove — but the data model stays a
 * plain comma-joined string, so it drops into any field that already stores one
 * (seed keywords, audience) with no schema change.
 *
 * Design rule: rounded-lg blocks, never rounded-full pills.
 */

function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function dedupe(tags: string[]): string[] {
  const seen = new Set<string>();
  return tags.filter((tag) => {
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) {
      return false;
    }
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
    if (parts.length > 0) {
      commit([...tags, ...parts]);
    }
    setDraft("");
  }

  function removeAt(index: number) {
    commit(tags.filter((_, i) => i !== index));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      // Only intercept when there's something to commit — an empty Enter is left
      // to bubble so the onboarding "press Enter to continue" flow still works.
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
      className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-2 transition focus-within:border-accent"
    >
      {tags.map((tag, index) => (
        <span
          key={`${tag}-${index}`}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-muted px-2.5 py-1 text-sm text-foreground"
        >
          {tag}
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            onClick={() => removeAt(index)}
            className="text-muted transition hover:text-foreground"
          >
            ×
          </button>
        </span>
      ))}
      <input
        id={id}
        aria-label={ariaLabel}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={addDraft}
        placeholder={tags.length === 0 ? placeholder : "Add another…"}
        className="min-w-[9rem] flex-1 bg-transparent px-1 py-1 text-sm text-foreground outline-none placeholder:text-muted"
      />
    </div>
  );
}
