"use client";

import { Kbd } from "@heroui/react";
import { Command } from "@heroui-pro/react";
import { useProgressRouter } from "@/components/feedback/navigation-progress";
import { SearchIcon } from "@/components/icons";
import { APP_NAV_ITEMS } from "@/components/layout/app-navigation";

export function AgentCommandMenu({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useProgressRouter();

  function navigate(key: React.Key) {
    onOpenChange(false);
    router.push(String(key));
  }

  return (
    <Command>
      <Command.Backdrop isOpen={isOpen} variant="blur" onOpenChange={onOpenChange}>
        <Command.Container size="lg">
          <Command.Dialog>
            <Command.InputGroup>
              <Command.InputGroup.Prefix>
                <SearchIcon className="size-4" />
              </Command.InputGroup.Prefix>
              <Command.InputGroup.Input placeholder="Go to Claudia, Content, or Checklist…" />
              <Command.InputGroup.ClearButton />
            </Command.InputGroup>
            <Command.List
              onAction={navigate}
              renderEmptyState={() => (
                <p className="p-6 text-center text-sm text-muted">No matching destination.</p>
              )}
            >
              <Command.Group heading="Workspace">
                {APP_NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Command.Item key={item.href} id={item.href} textValue={item.label}>
                      <Icon className="size-4" />
                      <span>{item.label}</span>
                    </Command.Item>
                  );
                })}
              </Command.Group>
            </Command.List>
            <Command.Footer className="justify-end">
              <span className="flex items-center gap-2 text-xs text-muted">
                <Kbd>
                  <Kbd.Content>Esc</Kbd.Content>
                </Kbd>{" "}
                Close
              </span>
            </Command.Footer>
          </Command.Dialog>
        </Command.Container>
      </Command.Backdrop>
    </Command>
  );
}
