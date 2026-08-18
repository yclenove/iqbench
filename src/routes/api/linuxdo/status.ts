import { createFileRoute } from "@tanstack/react-router";
import { linuxdoConfigured } from "@/lib/linuxdo";

export const Route = createFileRoute("/api/linuxdo/status")({
  server: {
    handlers: {
      GET: () => Response.json({ ok: linuxdoConfigured() }),
    },
  },
});
