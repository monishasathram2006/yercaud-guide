import { useMemo, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Card } from "@/components/ui/card";
import { ChevronDown, ChevronLeft, ChevronRight, Eye, MoreHorizontal, Pencil, Search, Trash2 } from "lucide-react";
import { EmptyState } from "./primitives";
import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: string;
  className?: string;
  render?: (row: T) => ReactNode;
  accessor?: (row: T) => string | number;
  sortable?: boolean;
};

export type DataTableProps<T extends { id: string | number }> = {
  columns: Column<T>[];
  data: T[];
  searchable?: boolean;
  searchPlaceholder?: string;
  filters?: { label: string; key: string; options: string[]; value: string; onChange: (v: string) => void }[];
  pageSize?: number;
  onView?: (row: T) => void;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  bulk?: boolean;
  /** Renders a small action bar above the table while selected.size > 0 — e.g. "3 selected: [Publish] [Delete]". Undefined by default, so every existing caller is unaffected. */
  bulkActions?: (selectedIds: (string | number)[], clearSelection: () => void) => ReactNode;
  rowActions?: (row: T) => ReactNode;
  emptyTitle?: string;
};

export function DataTable<T extends { id: string | number }>({
  columns,
  data,
  searchable = true,
  searchPlaceholder = "Search...",
  filters = [],
  pageSize = 8,
  onView,
  onEdit,
  onDelete,
  bulk = true,
  bulkActions,
  rowActions,
  emptyTitle,
}: DataTableProps<T>) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filtered = useMemo(() => {
    let out = data;
    if (query) {
      const q = query.toLowerCase();
      out = out.filter((row) =>
        JSON.stringify(row).toLowerCase().includes(q),
      );
    }
    if (sortKey) {
      const col = columns.find((c) => c.key === sortKey);
      if (col?.accessor) {
        const acc = col.accessor;
        out = [...out].sort((a, b) => {
          const av = acc(a);
          const bv = acc(b);
          if (av < bv) return sortDir === "asc" ? -1 : 1;
          if (av > bv) return sortDir === "asc" ? 1 : -1;
          return 0;
        });
      }
    }
    return out;
  }, [data, query, sortKey, sortDir, columns]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageData = filtered.slice((page - 1) * pageSize, page * pageSize);
  const showActions = Boolean(onView || onEdit || onDelete || rowActions);

  const toggleAll = () => {
    if (selected.size === pageData.length) setSelected(new Set());
    else setSelected(new Set(pageData.map((r) => r.id)));
  };

  return (
    <Card className="rounded-2xl border border-slate-200 shadow-sm bg-white p-4 gap-4">
      {(searchable || filters.length > 0) && (
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          {searchable && (
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                placeholder={searchPlaceholder}
                className="pl-9 h-9"
              />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {filters.map((f) => (
              <DropdownMenu key={f.key}>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9">
                    {f.label}: <span className="font-medium">{f.value}</span>
                    <ChevronDown className="w-3 h-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {f.options.map((opt) => (
                    <DropdownMenuItem key={opt} onClick={() => f.onChange(opt)}>
                      {opt}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ))}
          </div>
        </div>
      )}

      {bulk && bulkActions && selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800">
          <span className="font-medium">{selected.size} selected</span>
          <div className="flex items-center gap-2">{bulkActions([...selected], () => setSelected(new Set()))}</div>
        </div>
      )}

      {pageData.length === 0 ? (
        <EmptyState title={emptyTitle || "No results"} subtitle="Try adjusting your search or filters." />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {bulk && (
                  <TableHead className="w-8">
                    <Checkbox
                      checked={selected.size > 0 && selected.size === pageData.length}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                )}
                {columns.map((c) => (
                  <TableHead
                    key={c.key}
                    className={cn(c.className, c.sortable && "cursor-pointer select-none")}
                    onClick={() => {
                      if (!c.sortable) return;
                      if (sortKey === c.key) setSortDir(sortDir === "asc" ? "desc" : "asc");
                      else { setSortKey(c.key); setSortDir("asc"); }
                    }}
                  >
                    {c.header}
                  </TableHead>
                ))}
                {showActions && <TableHead className="w-20 text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageData.map((row) => (
                <TableRow key={row.id}>
                  {bulk && (
                    <TableCell>
                      <Checkbox
                        checked={selected.has(row.id)}
                        onCheckedChange={(v) => {
                          const s = new Set(selected);
                          if (v) s.add(row.id); else s.delete(row.id);
                          setSelected(s);
                        }}
                      />
                    </TableCell>
                  )}
                  {columns.map((c) => (
                    <TableCell key={c.key} className={c.className}>
                      {c.render ? c.render(row) : (row as any)[c.key]}
                    </TableCell>
                  ))}
                  {showActions && (
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {onView && (
                            <DropdownMenuItem onClick={() => onView(row)}>
                              <Eye className="w-4 h-4 mr-2" /> View
                            </DropdownMenuItem>
                          )}
                          {onEdit && (
                            <DropdownMenuItem onClick={() => onEdit(row)}>
                              <Pencil className="w-4 h-4 mr-2" /> Edit
                            </DropdownMenuItem>
                          )}
                          {rowActions && rowActions(row)}
                          {onDelete && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-red-600" onClick={() => onDelete(row)}>
                                <Trash2 className="w-4 h-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <div>
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="px-2">Page {page} of {totalPages}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === totalPages} onClick={() => setPage(page + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
