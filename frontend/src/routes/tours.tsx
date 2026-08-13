import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout only — see hotels.tsx. The listing lives in tours.index.tsx.
export const Route = createFileRoute("/tours")({
  component: () => <Outlet />,
});
