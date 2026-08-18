import { createFileRoute, Link } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  return (
    <main className="grid min-h-screen place-items-center bg-bg px-6 text-fg">
      <div className="w-full max-w-sm space-y-5 rounded-xl border border-border bg-surface p-6">
        <div>
          <p className="font-mono text-xs tracking-widest text-muted uppercase">IQ Bench</p>
          <h1 className="mt-2 text-2xl font-semibold text-balance">登录测评台</h1>
          <p className="mt-1 text-sm text-muted">可选。不登录也能直接测模型。</p>
        </div>
        {authEnabled ? (
          GROK_PROVIDERS.map((p) => (
            <button
              key={p.providerId}
              type="button"
              onClick={() => signIn(p.providerId, { callbackURL: "/" })}
              className="w-full rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm font-medium text-fg hover:border-primary"
            >
              使用 {p.label} 继续
            </button>
          ))
        ) : (
          <p className="text-sm text-muted">登录已关闭。</p>
        )}
        <Link to="/" className="block text-center text-sm text-primary">
          返回测评台
        </Link>
      </div>
    </main>
  );
}
