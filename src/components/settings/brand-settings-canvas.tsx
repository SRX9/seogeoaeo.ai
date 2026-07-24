"use client";

import {
  Accordion,
  Alert,
  Avatar,
  Button,
  Card,
  ColorSwatch,
  Form,
  Input,
  Label,
  TextArea,
  Tooltip,
  toast,
} from "@heroui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { CompetitorsPanel } from "@/components/brand/competitors-panel";
import { UseCasesPanel } from "@/components/brand/use-cases-panel";
import {
  ChevronRightIcon,
  LinkIcon,
  PenIcon,
  RefreshIcon,
  InsightIcon,
  QuoteIcon,
  ResearchIcon,
  TopicsIcon,
  UsersIcon,
  XIcon,
} from "@/components/icons";
import { LoadingButton } from "@/components/ui/loading-button";
import { apiPost, apiPut, getErrorMessage } from "@/lib/api/fetcher";
import {
  queryKeys,
  type BrandIntelligenceResponse,
  type BrandProfile,
  type Competitor,
  type UseCase,
} from "@/lib/api/queries";

type EditableSection = "positioning" | "voice" | null;

type BrandSettingsCanvasProps = {
  brandName: string;
  profile: BrandProfile;
  intelligence: BrandIntelligenceResponse;
  competitors: Competitor[];
  useCases: UseCase[];
};

function BrandIdentity({
  brandName,
  profile,
  intelligence,
}: Pick<BrandSettingsCanvasProps, "brandName" | "profile" | "intelligence">) {
  const queryClient = useQueryClient();
  const identity = intelligence.identity;
  const [showNote, setShowNote] = useState(true);
  const refresh = useMutation({
    mutationFn: () => apiPost<BrandIntelligenceResponse>("/api/brand/intelligence", {}),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.brandIntelligence, result);
      void queryClient.invalidateQueries({ queryKey: queryKeys.me });
      toast.success("Brand details are up to date.");
    },
    onError: (error) =>
      toast.danger(getErrorMessage(error, "Could not refresh brand details.")),
  });

  const website = profile.website.trim();
  const domain = identity?.domain || website.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const websiteHref = /^https?:\/\//i.test(website) ? website : `https://${website}`;
  const palette = identity?.colors.slice(0, 4) ?? [];

  return (
    <section className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]" aria-labelledby="brand-identity-heading">
      <Card className="rounded-2xl p-0">
        <Card.Header className="flex-row flex-wrap items-center gap-4 p-5 sm:p-6">
          <Avatar className="size-12 shrink-0">
            {identity?.logoUrl ? (
              <Avatar.Image alt={`${brandName} logo`} src={identity.logoUrl} />
            ) : null}
            <Avatar.Fallback className="text-sm font-semibold">
              {brandName.slice(0, 2).toUpperCase()}
            </Avatar.Fallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <Card.Title id="brand-identity-heading" className="truncate">
              {identity?.title || brandName}
            </Card.Title>
            {website ? (
              <a
                href={websiteHref}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-sm text-muted no-underline hover:text-foreground"
                aria-label={`Open ${domain} in a new tab`}
              >
                {domain || website}
                <LinkIcon className="size-3.5" aria-hidden />
              </a>
            ) : (
              <Card.Description>Add your website in Discovery below.</Card.Description>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2" aria-label="Brand color palette">
            {palette.length > 0 ? (
              palette.map((color) => (
                <ColorSwatch
                  key={color.hex}
                  aria-label={color.name ? `${color.name}, ${color.hex}` : color.hex}
                  color={color.hex}
                  colorName={color.name || undefined}
                  shape="square"
                  size="sm"
                />
              ))
            ) : (
              <span className="text-xs text-muted">No palette</span>
            )}
          </div>
        </Card.Header>
        <Card.Footer className="justify-end px-5 pb-5 sm:px-6 sm:pb-6">
          <LoadingButton
            variant="ghost"
            className="min-h-10 transition-transform active:scale-[0.96]"
            isPending={refresh.isPending}
            onPress={() => refresh.mutate()}
          >
            <RefreshIcon className="size-4" />
            {refresh.isPending ? "Refreshing" : "Refresh identity"}
          </LoadingButton>
        </Card.Footer>
      </Card>

      {showNote ? (
        <Alert status="accent" className="rounded-2xl">
          <Alert.Indicator>
            <InsightIcon className="size-4" />
          </Alert.Indicator>
          <Alert.Content>
            <Alert.Title>What Claudia Knows</Alert.Title>
            <Alert.Description>
              This context keeps research, answers, and articles aligned with your brand.
            </Alert.Description>
          </Alert.Content>
          <Tooltip delay={250}>
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              aria-label="Dismiss Claudia information"
              onPress={() => setShowNote(false)}
            >
              <XIcon />
            </Button>
            <Tooltip.Content>Dismiss</Tooltip.Content>
          </Tooltip>
        </Alert>
      ) : null}
    </section>
  );
}

function EditableNarrativeCard({
  title,
  description,
  icon,
  value,
  placeholder,
  rows,
  isEditing,
  isSaving,
  onEdit,
  onChange,
  onCancel,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  value: string;
  placeholder: string;
  rows: number;
  isEditing: boolean;
  isSaving: boolean;
  onEdit: () => void;
  onChange: (value: string) => void;
  onCancel: () => void;
}) {
  return (
    <Card className="rounded-2xl p-0">
      <Card.Header className="flex-row items-start gap-3 p-5 pb-3 sm:p-6 sm:pb-3">
        <span className="grid size-10 shrink-0 place-items-center text-muted" aria-hidden>
          {icon}
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <Card.Title>{title}</Card.Title>
          <Card.Description>{description}</Card.Description>
        </div>
        <Tooltip delay={250}>
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            className="size-10 shrink-0"
            aria-label={`Edit ${title.toLowerCase()}`}
            onPress={onEdit}
          >
            <PenIcon />
          </Button>
          <Tooltip.Content>Edit {title}</Tooltip.Content>
        </Tooltip>
      </Card.Header>
      <Card.Content className="px-5 pb-5 sm:px-6 sm:pb-6">
        {isEditing ? (
          <TextArea
            aria-label={title}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            variant="secondary"
            fullWidth
            rows={rows}
            autoFocus
          />
        ) : (
          <Button
            fullWidth
            variant="outline"
            className="h-auto min-h-24 justify-start whitespace-normal px-4 py-4 text-left leading-6 transition-transform active:scale-[0.96]"
            onPress={onEdit}
          >
            <span className={value ? "text-foreground" : "text-muted"}>{value || placeholder}</span>
          </Button>
        )}
      </Card.Content>
      {isEditing ? (
        <Card.Footer className="gap-2 px-5 pb-5 sm:px-6 sm:pb-6">
          <LoadingButton type="submit" size="sm" isPending={isSaving}>
            Save
          </LoadingButton>
          <Button size="sm" variant="ghost" onPress={onCancel}>
            Cancel
          </Button>
        </Card.Footer>
      ) : null}
    </Card>
  );
}

function ProfileSettings({ profile }: { profile: BrandProfile }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Partial<BrandProfile>>({});
  const [editing, setEditing] = useState<EditableSection>(null);
  const fields = { ...profile, ...draft };

  const save = useMutation({
    mutationFn: (payload: BrandProfile) => apiPut("/api/brand/profile", payload),
    onSuccess: () => {
      setDraft({});
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.brandProfile });
      void queryClient.invalidateQueries({ queryKey: queryKeys.onboarding });
      toast.success("Brand profile saved.");
    },
    onError: (error) =>
      toast.danger(getErrorMessage(error, "Could not save brand profile")),
  });

  const setField = (key: keyof BrandProfile, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  function cancel(section: Exclude<EditableSection, null>) {
    const key = section === "positioning" ? "productDescription" : "tone";
    setDraft((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setEditing(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.mutate(fields);
  }

  return (
    <Form aria-label="Brand profile" onSubmit={submit} className="space-y-4">
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <EditableNarrativeCard
          title="Positioning"
          description="What makes you different and why it matters."
          icon={<TopicsIcon className="size-[18px]" />}
          value={fields.productDescription}
          placeholder="Describe what your brand does differently."
          rows={4}
          isEditing={editing === "positioning"}
          isSaving={save.isPending}
          onEdit={() => setEditing("positioning")}
          onChange={(value) => setField("productDescription", value)}
          onCancel={() => cancel("positioning")}
        />
        <EditableNarrativeCard
          title="Voice"
          description="How your brand speaks and shows up."
          icon={<QuoteIcon className="size-[18px]" />}
          value={fields.tone}
          placeholder="Clear, expert, friendly."
          rows={4}
          isEditing={editing === "voice"}
          isSaving={save.isPending}
          onEdit={() => setEditing("voice")}
          onChange={(value) => setField("tone", value)}
          onCancel={() => cancel("voice")}
        />
      </div>

      <Accordion variant="surface" className="rounded-2xl">
        <Accordion.Item id="discovery">
          <Accordion.Heading>
            <Accordion.Trigger>
              <span className="flex min-w-0 flex-1 items-start gap-3 text-left">
                <span className="grid size-10 shrink-0 place-items-center text-muted" aria-hidden>
                  <ResearchIcon className="size-[18px]" />
                </span>
                <span className="flex min-w-0 flex-col pt-0.5">
                  <span className="font-semibold text-foreground">Discovery</span>
                  <span className="mt-1 text-sm font-normal text-muted">Market, audience, and query signals.</span>
                </span>
              </span>
              <Accordion.Indicator><ChevronRightIcon /></Accordion.Indicator>
            </Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <Accordion.Body className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="brand-audience">Target audience</Label>
                <Input
                  id="brand-audience"
                  value={fields.audience}
                  onChange={(event) => setField("audience", event.target.value)}
                  placeholder="Founders, developers, marketers"
                  variant="secondary"
                  fullWidth
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="brand-website">Website</Label>
                <Input
                  id="brand-website"
                  type="url"
                  value={fields.website}
                  onChange={(event) => setField("website", event.target.value)}
                  placeholder="https://example.com"
                  variant="secondary"
                  fullWidth
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="brand-keywords">Seed keywords</Label>
                <TextArea
                  id="brand-keywords"
                  value={fields.seedKeywords}
                  onChange={(event) => setField("seedKeywords", event.target.value)}
                  placeholder="content marketing, AI visibility, brand strategy"
                  variant="secondary"
                  fullWidth
                  rows={3}
                />
              </div>
              <LoadingButton type="submit" size="sm" className="sm:col-span-2 sm:w-fit" isPending={save.isPending}>
                Save discovery
              </LoadingButton>
            </Accordion.Body>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Form>
  );
}

function CollectionAccordion({
  competitors,
  useCases,
}: {
  competitors: Competitor[];
  useCases: UseCase[];
}) {
  return (
    <Accordion variant="surface" className="rounded-2xl" allowsMultipleExpanded>
      <Accordion.Item id="competitors">
        <Accordion.Heading>
          <Accordion.Trigger>
            <span className="flex min-w-0 flex-1 items-start gap-3 text-left">
              <span className="grid size-10 shrink-0 place-items-center text-muted" aria-hidden>
                <UsersIcon className="size-[18px]" />
              </span>
              <span className="flex min-w-0 flex-col pt-0.5">
                <span className="flex items-center gap-2 font-semibold text-foreground">
                  Competitors
                  {competitors.length > 0 ? <span className="text-sm font-medium text-accent tabular-nums">{competitors.length}</span> : null}
                </span>
                <span className="mt-1 text-sm font-normal text-muted">Your landscape and differentiators.</span>
              </span>
            </span>
            <Accordion.Indicator><ChevronRightIcon /></Accordion.Indicator>
          </Accordion.Trigger>
        </Accordion.Heading>
        <Accordion.Panel>
          <Accordion.Body><CompetitorsPanel competitors={competitors} /></Accordion.Body>
        </Accordion.Panel>
      </Accordion.Item>
      <Accordion.Item id="buyer-profiles">
        <Accordion.Heading>
          <Accordion.Trigger>
            <span className="flex min-w-0 flex-1 items-start gap-3 text-left">
              <span className="grid size-10 shrink-0 place-items-center text-muted" aria-hidden>
                <TopicsIcon className="size-[18px]" />
              </span>
              <span className="flex min-w-0 flex-col pt-0.5">
                <span className="flex items-center gap-2 font-semibold text-foreground">
                  Buyer profiles
                  {useCases.length > 0 ? <span className="text-sm font-medium text-accent tabular-nums">{useCases.length}</span> : null}
                </span>
                <span className="mt-1 text-sm font-normal text-muted">Who you serve and what they care about.</span>
              </span>
            </span>
            <Accordion.Indicator><ChevronRightIcon /></Accordion.Indicator>
          </Accordion.Trigger>
        </Accordion.Heading>
        <Accordion.Panel>
          <Accordion.Body><UseCasesPanel useCases={useCases} /></Accordion.Body>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}

export function BrandSettingsCanvas({
  brandName,
  profile,
  intelligence,
  competitors,
  useCases,
}: BrandSettingsCanvasProps) {
  return (
    <div className="max-w-6xl space-y-5">
      <BrandIdentity brandName={brandName} profile={profile} intelligence={intelligence} />
      <ProfileSettings profile={profile} />
      <CollectionAccordion competitors={competitors} useCases={useCases} />
      <div className="flex items-start gap-3 rounded-2xl bg-surface-secondary px-4 py-3.5 text-sm leading-6 text-muted">
        <InsightIcon className="mt-1 size-4 shrink-0 text-accent" aria-hidden />
        <p>Claudia keeps these signals aligned across research, answers, and articles.</p>
      </div>
    </div>
  );
}
