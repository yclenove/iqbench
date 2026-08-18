import { Link } from "@tanstack/react-router";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

function AuthSlot() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) return <div className="h-9 w-16 animate-pulse rounded-lg bg-surface-2" />;
  return user ? (
    <UserButton />
  ) : (
    <Link to="/login" className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-fg">
      登录
    </Link>
  );
}

export function AppHeader({ page }: { page: "home" | "board" }) {
  const item = (to: "/" | "/board", label: string, on: boolean) => (
    <Link
      to={to}
      className={`rounded-md px-2.5 py-1 text-sm ${on ? "bg-surface-2 text-fg" : "text-muted hover:text-fg"}`}
    >
      {label}
    </Link>
  );

  return (
    <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <img src="/favicon.svg" alt="" className="size-12 rounded-xl sm:size-14" />
        <div className="min-w-0">
          <p className="text-xl font-semibold leading-none tracking-tight sm:text-2xl">猛蹬·145</p>
          <p className="mt-1 text-[11px] text-muted">我就看智商能低到什么程度</p>
        </div>
        <nav className="ml-2 hidden items-center gap-1 sm:flex">
          {item("/", "测评", page === "home")}
          {item("/board", "榜单", page === "board")}
        </nav>
      </div>
      <div className="flex items-center gap-2">
        <nav className="flex items-center gap-1 sm:hidden">
          {item("/", "测评", page === "home")}
          {item("/board", "榜单", page === "board")}
        </nav>
        <AuthSlot />
      </div>
    </header>
  );
}
