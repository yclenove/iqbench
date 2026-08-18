import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

export function AppErrorComponent({ error }: ErrorComponentProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg px-6 text-center text-fg">
      <span className="text-bad" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <p className="kicker">Error</p>
      <h1 className="font-serif text-xl font-bold">页面出错了</h1>
      <p className="max-w-md break-words text-sm text-muted">
        {error.message || "发生了意外错误，试试刷新页面。"}
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-2 rounded-lg border border-border px-4 py-2 text-sm text-muted transition-colors hover:border-primary hover:text-fg"
      >
        刷新
      </button>
    </main>
  );
}
