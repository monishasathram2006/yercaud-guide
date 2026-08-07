import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader, SkeletonList, EmptyState } from "../components/primitives";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/**
 * FR162's privileged-action history. The endpoint pages but reports no
 * total, so navigation is prev/next: "next" stays live while a page comes
 * back full. Actor ids resolve through the Users list; null means the actor
 * account was since deleted (audit rows outlive their actors — ADR 0009).
 */
const PAGE_SIZE = 20;

export function AuditLogPage() {
  const { can } = useAuth();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", page],
    queryFn: ({ signal }) => api.admin.auditLogs({ page, pageSize: PAGE_SIZE }, signal),
  });
  const { data: users } = useQuery({
    queryKey: ["users", "All"],
    queryFn: ({ signal }) => api.users.list({}, signal),
    enabled: can("Users", "view"),
  });
  const actorName = (id: string | null | undefined) =>
    id ? users?.find((u) => u.id === id)?.name ?? id.slice(0, 8) : "(deleted account)";

  return (
    <>
      <PageHeader title="Audit Log" subtitle="Every privileged action, recorded — approvals, role changes, impersonations." />
      {isLoading ? (
        <SkeletonList rows={8} />
      ) : (
        <Card className="rounded-2xl border border-slate-200 shadow-sm bg-white p-4 gap-4">
          {!data || data.length === 0 ? (
            <EmptyState title={page === 1 ? "No audit entries yet" : "No more entries"} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 border-b border-slate-200 text-left">
                    <th className="py-2 pr-4">When</th>
                    <th className="py-2 pr-4">Actor</th>
                    <th className="py-2 pr-4">Action</th>
                    <th className="py-2 pr-4">Table</th>
                    <th className="py-2">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((entry) => (
                    <tr key={entry.id} className="border-b border-slate-100 align-top">
                      <td className="py-2 pr-4 whitespace-nowrap text-slate-500">
                        {entry.createdAt ? new Date(entry.createdAt).toLocaleString("en-IN") : "—"}
                      </td>
                      <td className="py-2 pr-4 font-medium">{actorName(entry.actorId)}</td>
                      <td className="py-2 pr-4"><code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{entry.action}</code></td>
                      <td className="py-2 pr-4 text-slate-600">{entry.tableName}</td>
                      <td className="py-2 text-xs text-slate-500 max-w-md">
                        {entry.oldData || entry.newData ? (
                          <details>
                            <summary className="cursor-pointer text-slate-600">details</summary>
                            <pre className="mt-1 whitespace-pre-wrap break-all">
                              {JSON.stringify({ old: entry.oldData ?? undefined, new: entry.newData ?? undefined }, null, 1)}
                            </pre>
                          </details>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex items-center justify-between text-sm text-slate-500">
            <div>Page {page}</div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={(data?.length ?? 0) < PAGE_SIZE}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
