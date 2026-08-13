import { type ReactNode } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export function FormDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  onSave,
  saveLabel = "Save",
  size = "md",
  saveDisabled = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  /**
   * `unknown` (not `void`) so existing callers whose onSave incidentally
   * returns something (e.g. `() => toast.success(...)`, which returns a
   * toast id) keep typechecking unchanged. Returning exactly `false` (or a
   * Promise resolving to exactly `false`) keeps the drawer open instead of
   * closing immediately — for a caller that needs to await a mutation and
   * show a server-rejection reason inline (issue #23's Sponsored-placement
   * cap error) rather than optimistically closing first.
   */
  onSave?: () => unknown;
  saveLabel?: string;
  size?: "md" | "lg";
  /** For a drawer that seeds its form from an async fetch (e.g. GET before a full-replace PUT) — keeps Save from firing before that data has actually loaded. */
  saveDisabled?: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className={size === "lg" ? "sm:max-w-2xl w-full overflow-y-auto" : "sm:max-w-lg w-full overflow-y-auto"}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="py-5 space-y-5 px-4">{children}</div>
        <SheetFooter className="flex-row justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={saveDisabled}
            onClick={async () => {
              const result = await onSave?.();
              if (result !== false) onOpenChange(false);
            }}
          >
            {saveLabel}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
