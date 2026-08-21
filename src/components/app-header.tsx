import { Link } from "@tanstack/react-router";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useLiveBench } from "@/lib/live-bench";

const REPO = "https://github.com/yclenove/iqbench";

function AuthSlot() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) return <div className="h-9 w-16 animate-pulse rounded-lg bg-surface-2" />;
  return user ? (
    <UserButton />
  ) : (
    <Link
      to="/login"
      className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-primary hover:text-fg"
    >
      登录
    </Link>
  );
}

export function AppHeader({ page }: { page: "home" | "board" | "status" | "gallery" }) {
  const live = useLiveBench();
  const item = (tab: "home" | "board" | "status" | "gallery", label: string, on: boolean) => {
    const to = tab === "status" ? "/status" : tab === "gallery" ? "/gallery" : "/";
    const search = tab === "board" ? { tab: "board" as const } : tab === "home" ? { tab: undefined } : undefined;
    return (
      <Link
        to={to}
        search={search}
        className={`border-b-2 px-1 pb-1.5 pt-1 text-sm transition-colors ${
          on ? "border-primary font-medium text-fg" : "border-transparent text-muted hover:text-fg"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="border-b border-border/70">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <img src="/favicon.svg" alt="" className="size-10 rounded-xl sm:size-11" />
          <div className="min-w-0">
            <p className="text-lg font-bold leading-none tracking-tight sm:text-xl">
              猛蹬·<span className="font-serif">145</span>
            </p>
            <p className="mt-1 hidden font-mono text-[10px] tracking-[0.2em] text-faint uppercase sm:block">
              {live.running ? "测评还在跑 · 切页不会停" : "Mengdeng 145 · IQBench v7"}
            </p>
          </div>
          <nav className="ml-4 hidden items-end gap-4 sm:flex">
            {item("home", "测评", page === "home")}
            {item("board", "榜单", page === "board")}
            {item("gallery", "画廊", page === "gallery")}
            {item("status", "状态", page === "status")}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <nav className="flex items-end gap-4 sm:hidden">
            {item("home", "测评", page === "home")}
            {item("board", "榜单", page === "board")}
            {item("gallery", "画廊", page === "gallery")}
            {item("status", "状态", page === "status")}
          </nav>
          <AuthSlot />
          <a
            href={REPO}
            target="_blank"
            rel="noreferrer"
            className="hidden rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-primary hover:text-fg sm:inline"
          >
            GitHub
          </a>
        </div>
      </div>
    </header>
  );
}
