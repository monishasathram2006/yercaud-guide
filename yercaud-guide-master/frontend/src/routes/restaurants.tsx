import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout only — see hotels.tsx. The listing lives in restaurants.index.tsx.
export const Route = createFileRoute("/restaurants")({
  component: () => <Outlet />,
});
