import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/admin/components/AdminLayout";
import { AdminRouter } from "@/admin/AdminRouter";

export const Route = createFileRoute("/$")({
  component: SplatPage,
});

function SplatPage() {
  return (
    <AdminLayout>
      <AdminRouter />
    </AdminLayout>
  );
}
