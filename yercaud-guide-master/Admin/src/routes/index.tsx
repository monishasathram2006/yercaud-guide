import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/admin/components/AdminLayout";
import { AdminRouter } from "@/admin/AdminRouter";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Yercaud Business Directory — Admin Panel" },
      { name: "description", content: "Manage the Yercaud business directory: listings, bookings, users, channels and more." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <AdminLayout>
      <AdminRouter path="/dashboard" />
    </AdminLayout>
  );
}
