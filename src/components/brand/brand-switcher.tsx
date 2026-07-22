"use client";

import { Avatar, Button, Dropdown, Label } from "@heroui/react";
import { ThinkingOrb } from "thinking-orbs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@heroui/react";
import { useProgressRouter } from "@/components/feedback/navigation-progress";
import { apiPut, getErrorMessage } from "@/lib/api/fetcher";
import { queryKeys, type MeResponse } from "@/lib/api/queries";
import { ChevronUpDownIcon, CircleCheckIcon } from "@/components/icons";

type BrandOption = {
  id: string;
  name: string;
  identity?: { logoUrl: string | null; colors: Array<{ hex: string }> } | null;
};

const ADD_BRAND_KEY = "__add_brand__";

function brandInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "B";
}

function BrandGlyph({ brand }: { brand: BrandOption }) {
  return (
    <Avatar size="sm" className="size-6 shrink-0 rounded-lg bg-accent-soft">
      {brand.identity?.logoUrl ? <Avatar.Image alt="" src={brand.identity.logoUrl} /> : null}
      <Avatar.Fallback>
        <span className="flex size-full items-center justify-center text-xs font-semibold tracking-tight text-accent-soft-foreground">
          {brandInitial(brand.name)}
        </span>
      </Avatar.Fallback>
    </Avatar>
  );
}

export function BrandSwitcher({
  brands,
  activeBrandId,
}: {
  brands: BrandOption[];
  activeBrandId: string | null;
}) {
  const router = useProgressRouter();
  const queryClient = useQueryClient();
  const active = brands.find((brand) => brand.id === activeBrandId) ?? brands[0] ?? null;

  const switchBrand = useMutation({
    mutationFn: (brandId: string) => apiPut("/api/brands/active", { brandId }),
    // Mark the new brand active in the `me` cache up front so the switcher's
    // label and checkmark move on click instead of after the refetch.
    onMutate: async (brandId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.me });
      const previous = queryClient.getQueryData<MeResponse>(queryKeys.me);
      queryClient.setQueryData<MeResponse>(queryKeys.me, (current) =>
        current ? { ...current, activeBrandId: brandId } : current,
      );
      return { previous };
    },
    onError: (error, _brandId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.me, context.previous);
      }
      toast.danger(getErrorMessage(error, "Couldn't switch brands."));
    },
    onSuccess: async () => {
      // Query keys intentionally omit the brand id because the active brand is
      // cookie-scoped. Remove every brand-scoped entry atomically so data from
      // the previous brand can never flash while the new route is loading.
      await queryClient.cancelQueries({
        predicate: (query) => query.queryKey[0] !== queryKeys.me[0],
      });
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== queryKeys.me[0],
      });
      router.push("/dashboard");
      router.refresh();
    },
  });

  function handleAction(key: string) {
    if (key === ADD_BRAND_KEY) {
      router.push("/onboarding");
      return;
    }
    if (!active || key === active.id || switchBrand.isPending) {
      return;
    }
    switchBrand.mutate(key);
  }

  if (!active) {
    return (
      <Button
        variant="secondary"
        className="w-full justify-start gap-2 rounded-xl"
        onPress={() => router.push("/onboarding")}
      >
        <span className="flex size-6 items-center justify-center rounded-lg border border-dashed border-border text-muted">
          +
        </span>
        <span className="text-sm font-medium tracking-tight">Add your first brand</span>
      </Button>
    );
  }

  return (
    <Dropdown>
      <Button
        variant="ghost"
        aria-label="Switch brand"
        isDisabled={switchBrand.isPending}
        className="h-auto w-full justify-start gap-2 rounded-xl px-2 py-2"
      >
        <BrandGlyph brand={active} />
        <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold tracking-tight text-foreground">
          {active.name}
        </span>
        {switchBrand.isPending ? (
          <ThinkingOrb state="working" size={20} className="shrink-0" aria-hidden />
        ) : (
          <ChevronUpDownIcon className="size-4 shrink-0 text-muted" />
        )}
      </Button>
      <Dropdown.Popover className="min-w-[240px]" placement="bottom start">
        <div className="px-3 pb-1 pt-2 text-xs font-medium text-muted">
          Brands
        </div>
        <Dropdown.Menu onAction={(key) => handleAction(String(key))}>
          {brands.map((brand) => (
            <Dropdown.Item key={brand.id} id={brand.id} textValue={brand.name}>
              <BrandGlyph brand={brand} />
              <Label className="flex-1 truncate">{brand.name}</Label>
              {brand.id === active.id ? (
                <CircleCheckIcon className="size-4 text-success" />
              ) : null}
            </Dropdown.Item>
          ))}
          <Dropdown.Item id={ADD_BRAND_KEY} textValue="Add brand">
            <span className="flex size-6 items-center justify-center rounded-md border border-dashed border-border text-muted">
              +
            </span>
            <Label>Add brand</Label>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
