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
    <main className="min-h-screen text-fg">
      <AppHeader page="board" />
      <div className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="mb-5 mt-6">
          <p className="kicker">Leaderboard</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">榜单</h1>
          <p className="mt-1 text-sm text-muted">公开榜来自登录用户的同步成绩。点本机历史可回到测评页对照。</p>
        </div>
        <BenchArchive
          signedIn={Boolean(user)}
          refresh={tick}
          onChanged={() => setTick((n) => n + 1)}
          onOpen={openRun}
        />
      </div>
    </main>
  );
}
