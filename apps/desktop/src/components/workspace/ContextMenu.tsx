import * as RadixContextMenu from "@radix-ui/react-context-menu";
import { Check, ChevronRight } from "lucide-react";
import { cloneElement, isValidElement } from "react";
import type { MouseEvent as ReactMouseEvent, ReactElement, ReactNode } from "react";

export type ContextMenuAction = {
  id: string;
  label: string;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  shortcut?: string;
  icon?: ReactNode;
  checked?: boolean;
  hint?: string;
  keepOpen?: boolean;
  separatorBefore?: boolean;
  separatorAfter?: boolean;
  children?: ContextMenuAction[];
};

type ContextMenuProps = {
  actions: ContextMenuAction[];
  children: ReactNode;
  header?: ReactNode;
  sideOffset?: number;
};

function hasUsableAction(action: ContextMenuAction): boolean {
  if (action.disabled) {
    return false;
  }
  if (action.children && action.children.length > 0) {
    return action.children.some((child) => hasUsableAction(child));
  }
  return typeof action.onSelect === "function";
}

function ItemRow({ action }: { action: ContextMenuAction }) {
  const baseClass =
    "flex cursor-pointer select-none items-center justify-between gap-3 border-b border-[var(--catwa-border-soft)] px-3 py-2.5 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-45";
  const toneClass = action.danger
    ? "text-rose-300 focus:bg-transparent data-[highlighted]:bg-transparent data-[highlighted]:text-rose-200"
    : "text-[var(--catwa-text-main)] focus:bg-transparent data-[highlighted]:bg-transparent data-[highlighted]:text-white";

  if (action.children && action.children.length > 0) {
    return (
      <div key={action.id}>
        <RadixContextMenu.Sub>
          {action.separatorBefore && <RadixContextMenu.Separator className="h-px bg-[var(--catwa-border-soft)]" />}
          <RadixContextMenu.SubTrigger className={`${baseClass} ${toneClass}`} disabled={action.disabled}>
            <span className="flex min-w-0 items-center gap-2">
              {action.icon ? <span className="text-slate-400">{action.icon}</span> : null}
              <span className="truncate">{action.label}</span>
            </span>
            <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
          </RadixContextMenu.SubTrigger>
          <RadixContextMenu.Portal>
            <RadixContextMenu.SubContent
              alignOffset={-2}
              className="catwa-context-enter z-[131] max-h-[75vh] w-[min(92vw,320px)] overflow-y-auto rounded-xl border border-[var(--catwa-border)] bg-[color:color-mix(in_srgb,var(--catwa-panel)_94%,black_6%)] p-0 shadow-2xl backdrop-blur sm:min-w-[220px] sm:w-auto"
              collisionPadding={12}
              loop
              style={{ marginTop: 8 }}
            >
              {action.children.map((child) => (
                <ItemRow action={child} key={child.id} />
              ))}
            </RadixContextMenu.SubContent>
          </RadixContextMenu.Portal>
          {action.separatorAfter && <RadixContextMenu.Separator className="h-px bg-[var(--catwa-border-soft)]" />}
        </RadixContextMenu.Sub>
      </div>
    );
  }

  return (
    <div key={action.id}>
      {action.separatorBefore && <RadixContextMenu.Separator className="h-px bg-[var(--catwa-border-soft)]" />}
      <RadixContextMenu.Item
        className={`${baseClass} ${toneClass}`}
        disabled={action.disabled}
        onSelect={(event) => {
          if (action.keepOpen) {
            event.preventDefault();
          }
          action.onSelect?.();
        }}
      >
        <span className="flex min-w-0 items-center gap-2">
          {action.checked ? <Check className="h-3.5 w-3.5 text-[var(--catwa-accent)]" /> : null}
          {action.icon ? <span className="text-slate-400">{action.icon}</span> : null}
          <span className="truncate">{action.label}</span>
        </span>
        <span className="ml-6 flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] text-slate-500">
          {action.hint ? <span>{action.hint}</span> : null}
          {action.shortcut ? <span>{action.shortcut}</span> : null}
        </span>
      </RadixContextMenu.Item>
      {action.separatorAfter && <RadixContextMenu.Separator className="h-px bg-[var(--catwa-border-soft)]" />}
    </div>
  );
}

export function ContextMenu({ actions, children, header, sideOffset = 8 }: ContextMenuProps) {
  const hasAnyUsableAction = actions.some((action) => hasUsableAction(action));
  if (!hasAnyUsableAction && !header) {
    if (isValidElement(children)) {
      const element = children as ReactElement<{ onContextMenu?: (event: ReactMouseEvent<HTMLElement>) => void }>;
      return cloneElement(element, {
        onContextMenu: (event: ReactMouseEvent<HTMLElement>) => {
          event.preventDefault();
          element.props.onContextMenu?.(event);
        }
      });
    }
    return <span onContextMenu={(event) => event.preventDefault()}>{children}</span>;
  }

  return (
    <RadixContextMenu.Root modal={false}>
      <RadixContextMenu.Trigger asChild>{children}</RadixContextMenu.Trigger>

      <RadixContextMenu.Portal>
        <RadixContextMenu.Content
          alignOffset={-2}
          className="catwa-context-enter z-[130] max-h-[78vh] w-[min(94vw,340px)] overflow-y-auto rounded-xl border border-[var(--catwa-border)] bg-[color:color-mix(in_srgb,var(--catwa-panel)_94%,black_6%)] p-0 shadow-2xl backdrop-blur sm:min-w-[260px] sm:w-auto"
          collisionPadding={12}
          loop
          style={{ marginTop: sideOffset }}
        >
          {header ? (
            <>
              <div className="px-3 py-2">{header}</div>
              <RadixContextMenu.Separator className="h-px bg-[var(--catwa-border-soft)]" />
            </>
          ) : null}
          {actions.map((action) => (
            <ItemRow action={action} key={action.id} />
          ))}
        </RadixContextMenu.Content>
      </RadixContextMenu.Portal>
    </RadixContextMenu.Root>
  );
}
