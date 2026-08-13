import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout only. `/hotels/$id` is a child of this route, so it can render ONLY
// through this Outlet — putting the listing page here instead swallows the
// detail page (the child's head/loader still run, so the tab title looks
// right while the body shows the listing). The listing lives in hotels.index.tsx.
export const Route = createFileRoute("/hotels")({
  component: () => <Outlet />,
});
