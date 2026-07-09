"use client";

import { Button, Dropdown, Label, Spinner } from "@heroui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "@heroui/react";
import { apiPut, getErrorMessage } from "@/lib/api/fetcher";
import { queryKeys, type MeResponse } from "@/lib/api/queries";
import { ChevronUpDownIcon, CircleCheckIcon } from "@/components/icons";

type BrandOption = { id: string; name: string };

const ADD_BRAND_KEY = "__add_brand__";

function brandInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "B";
}

function BrandGlyph({ name }: { name: string }) {
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-accent-soft text-xs font-semibold text-accent-soft-foreground">
      {brandInitial(name)}
    </span>
  );
}

export function BrandSwitcher({
  brands,
  activeBrandId,
}: {
  brands: BrandOption[];
  activeBrandId: string | null;
}) {
  const router = useRouter();
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
    // The active brand scopes every query, so refresh the whole cache on switch.
    onSuccess: () => queryClient.invalidateQueries(),
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
        className="w-full justify-start gap-2"
        onPress={() => router.push("/onboarding")}
      >
        <span className="flex size-6 items-center justify-center rounded-md border border-dashed border-border text-muted">
          +
        </span>
        <span className="text-sm font-medium">Add your first brand</span>
      </Button>
    );
  }

  return (
    <Dropdown>
      <Button
        variant="ghost"
        aria-label="Switch brand"
        isDisabled={switchBrand.isPending}
        className="h-auto w-full justify-start gap-2 px-2 py-2"
      >
        <BrandGlyph name={active.name} />
        <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-foreground">
          {active.name}
        </span>
        {switchBrand.isPending ? (
          <Spinner size="sm" color="current" className="shrink-0" />
        ) : (
          <ChevronUpDownIcon className="size-4 shrink-0 text-muted" />
        )}
      </Button>
      <Dropdown.Popover className="min-w-[240px]" placement="bottom start">
        <div className="px-3 pb-1 pt-2 text-xs font-medium text-muted">Brands</div>
        <Dropdown.Menu onAction={(key) => handleAction(String(key))}>
          {brands.map((brand) => (
            <Dropdown.Item key={brand.id} id={brand.id} textValue={brand.name}>
              <BrandGlyph name={brand.name} />
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
