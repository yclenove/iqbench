import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/board")({
  beforeLoad: () => {
    throw redirect({ to: "/", search: { tab: "board" } });
  },
});
