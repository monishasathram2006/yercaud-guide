import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout only — see hotels.tsx. The listing lives in activities.index.tsx.
export const Route = createFileRoute("/activities")({
  component: () => <Outlet />,
});
