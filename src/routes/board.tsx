import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppHeader } from "@/components/app-header";
import { BenchArchive } from "@/components/bench-archive";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { type BenchRun } from "@/lib/bench-store";

export const Route = createFileRoute("/board")({ component: Board });

function Board() {
  const { user } = useCurrentUserState();
  const navigate = useNavigate();
  const [tick, setTick] = useState(0);

  const openRun = (run: BenchRun) => {
    try {
      sessionStorage.setItem("iqbench_open_run", run.id);
    } catch {
      /* ignore */
    }
    void navigate({ to: "/" });
  };

  return (
    <main className="min-h-screen bg-bg text-fg">
      <AppHeader page="board" />
      <div className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
        <div className="mb-5">
          <h1 className="text-2xl font-semibold tracking-tight">榜单</h1>
          <p className="mt-1 text-sm text-muted">公开榜来自登录用户的同步成绩。点本机历史可回到测评页对照。</p>
        </div>
        <BenchArchive
          host=""
          keyFp=""
          signedIn={Boolean(user)}
          refresh={tick}
          layout="page"
          onChanged={() => setTick((n) => n + 1)}
          onOpen={openRun}
        />
      </div>
    </main>
  );
}
