import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";

export const Route = createFileRoute("/login")({ component: Login });

function inFrame() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function Login() {
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const data = e.data as { source?: string; token?: string | null };
      if (data?.source !== "grok-auth-popup") return;
      if (data.token) {
        try {
          sessionStorage.setItem("grok-auth.bearer-token", data.token);
        } catch {
          /* ignore */
        }
        window.location.replace("/");
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const openLinuxdo = () => {
    const popup = inFrame();
    const href = popup ? "/api/linuxdo/start?popup=1" : "/api/linuxdo/start";
    if (popup) window.open(href, "linuxdo", "width=480,height=720");
    else window.location.href = href;
  };

  return (
    <main className="grid min-h-screen place-items-center px-6 text-fg">
      <div className="card w-full max-w-sm space-y-5 p-6">
        <div className="flex flex-col items-center text-center">
          <img src="/favicon.svg" alt="" className="size-14 rounded-2xl" />
          <p className="kicker mt-4">猛蹬·145</p>
          <h1 className="mt-2 text-2xl font-bold text-balance">登录测评台</h1>
          <p className="mt-1 text-sm text-muted">我就看智商能低到什么程度。大模型能飞。</p>
        </div>
        {authEnabled ? (
          <>
            <button
              type="button"
              onClick={openLinuxdo}
              className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-fg transition-opacity hover:opacity-90"
            >
              使用 LINUX DO 继续
            </button>
            {GROK_PROVIDERS.map((p) => (
              <button
                key={p.providerId}
                type="button"
                onClick={() => signIn(p.providerId, { callbackURL: "/" })}
                className="w-full rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm font-medium text-fg transition-colors hover:border-primary"
              >
                使用 {p.label} 继续
              </button>
            ))}
          </>
        ) : (
          <p className="text-sm text-muted">登录已关闭。</p>
        )}
        <Link to="/" search={{ tab: undefined }} className="block text-center text-sm text-muted transition-colors hover:text-primary">
          返回测评台
        </Link>
      </div>
    </main>
  );
}
