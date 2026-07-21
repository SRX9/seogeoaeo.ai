"use client";

import { Form, Input, Label, ListBox, Select, TextArea } from "@heroui/react";
import { buttonVariants } from "@heroui/react/button";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { LoadingButton } from "@/components/ui/loading-button";
import { apiPost, getErrorMessage } from "@/lib/api/fetcher";
import {
  CONTACT_CATEGORIES,
  CONTACT_CATEGORY_LABELS,
  type ContactCategory,
} from "@/lib/contact/schema";

type ContactFields = {
  category: ContactCategory;
  message: string;
  website: string;
};

const emptyFields: ContactFields = {
  category: "product_support",
  message: "",
  website: "",
};

/** Contact form backed by POST /api/contact; signed-out visitors see a disabled preview. */
export function ContactForm({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [fields, setFields] = useState<ContactFields>(emptyFields);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const set =
    (field: keyof ContactFields) =>
    (event: { target: { value: string } }) =>
      setFields((current) => ({ ...current, [field]: event.target.value }));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAuthenticated) return;

    setError(null);
    setSubmitted(false);

    setIsPending(true);

    try {
      await apiPost("/api/contact", fields);
      setFields(emptyFields);
      setSubmitted(true);
    } catch (submissionError) {
      setError(getErrorMessage(submissionError, "We could not send your message. Please try again."));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Form aria-label="Contact support" onSubmit={handleSubmit} className="max-w-xl space-y-5">
      <div className="max-w-sm">
        <Select
          aria-label="Request category"
          isDisabled={!isAuthenticated}
          value={fields.category}
          onChange={(value) =>
            setFields((current) => ({ ...current, category: String(value) as ContactCategory }))
          }
          variant="secondary"
          fullWidth
        >
          <Label>What can we help with?</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {CONTACT_CATEGORIES.map((category) => (
                <ListBox.Item
                  key={category}
                  id={category}
                  textValue={CONTACT_CATEGORY_LABELS[category]}
                >
                  {CONTACT_CATEGORY_LABELS[category]}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="contact-message">How can we help?</Label>
        <TextArea
          id="contact-message"
          name="message"
          value={fields.message}
          disabled={!isAuthenticated}
          onChange={set("message")}
          required
          minLength={2}
          maxLength={5_000}
          rows={6}
          variant="secondary"
          fullWidth
          className="resize-y"
        />
      </div>

      <div className="absolute -left-[10000px] top-auto size-px overflow-hidden" aria-hidden="true">
        <Label htmlFor="contact-website">Website</Label>
        <Input
          id="contact-website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={fields.website}
          disabled={!isAuthenticated}
          onChange={set("website")}
        />
      </div>

      {isAuthenticated ? (
        <p className="text-sm leading-relaxed text-muted">
          We will reply to the email address associated with your signed-in account. We use these
          details only to respond to your request, as described in our Privacy Policy.
        </p>
      ) : (
        <p className="text-sm leading-relaxed text-muted">
          Sign in to choose a category, write your message, and contact our support team.
        </p>
      )}
      {error ? (
        <p role="alert" className="text-sm leading-relaxed text-danger">
          {error}
        </p>
      ) : null}
      {submitted ? (
        <p role="status" className="text-sm leading-relaxed text-success">
          Thanks. Your message has reached our support team, and we will reply by email.
        </p>
      ) : null}
      {isAuthenticated ? (
        <LoadingButton type="submit" isPending={isPending} pendingLabel="Sending message...">
          Send message
        </LoadingButton>
      ) : (
        <Link href="/login?callbackURL=/contact" className={buttonVariants()}>
          Log in to contact
        </Link>
      )}
    </Form>
  );
}
