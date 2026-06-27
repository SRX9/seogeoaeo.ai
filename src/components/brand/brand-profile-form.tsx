"use client";

import { Input, Label, TextArea, toast } from "@heroui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { LoadingButton } from "@/components/ui/loading-button";
import { apiPut, getErrorMessage } from "@/lib/api/fetcher";
import { queryKeys } from "@/lib/api/queries";

type BrandProfile = {
  productDescription: string;
  audience: string;
  tone: string;
  website: string;
  seedKeywords: string;
};

type BrandProfileFormProps = {
  initial: BrandProfile;
};

export function BrandProfileForm({ initial }: BrandProfileFormProps) {
  const queryClient = useQueryClient();
  // Controlled state — HeroUI/react-aria inputs don't reliably surface edits
  // through native FormData, so we own the values here (see onboarding form).
  const [fields, setFields] = useState<BrandProfile>(initial);

  const set =
    (key: keyof BrandProfile) =>
      (event: { target: { value: string } }) =>
        setFields((prev) => ({ ...prev, [key]: event.target.value }));

  const save = useMutation({
    mutationFn: (payload: BrandProfile) => apiPut("/api/brand/profile", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.brandProfile });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      toast.success("Brand profile saved.");
    },
    onError: (error) =>
      toast.danger(getErrorMessage(error, "Could not save brand profile")),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.mutate(fields);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="productDescription">Product description</Label>
        <TextArea
          id="productDescription"
          name="productDescription"
          value={fields.productDescription}
          onChange={set("productDescription")}
          placeholder="What does your product do and who is it for?"
          variant="secondary"
          fullWidth
          rows={6}
          className=" resize-none "
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="audience">Target audience</Label>
          <Input
            id="audience"
            name="audience"
            value={fields.audience}
            onChange={set("audience")}
            placeholder="Founders, developers, marketers..."
            variant="secondary"
            fullWidth
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tone">Tone of voice</Label>
          <Input
            id="tone"
            name="tone"
            value={fields.tone}
            onChange={set("tone")}
            placeholder="Clear, expert, friendly..."
            variant="secondary"
            fullWidth
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="website">Website</Label>
        <Input
          id="website"
          name="website"
          type="url"
          value={fields.website}
          onChange={set("website")}
          placeholder="https://example.com"
          variant="secondary"
          fullWidth
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="seedKeywords">Seed keywords</Label>
        <TextArea
          id="seedKeywords"
          name="seedKeywords"
          value={fields.seedKeywords}
          onChange={set("seedKeywords")}
          placeholder="content marketing automation, seo blog agent"
          variant="secondary"
          fullWidth
        />
      </div>
      <LoadingButton type="submit" isPending={save.isPending} pendingLabel="Saving…">
        Save brand profile
      </LoadingButton>
    </form>
  );
}
