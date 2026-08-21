import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { ViewportLock } from "@/components/viewport-lock";
import appCss from "../styles.css?url";

const APP_NAME = "猛蹬·145";
const host = import.meta.env.VITE_PUBLIC_HOSTNAME;
const ogImage = host ? `https://${host}/og.jpg` : undefined;
const xBanner = host ? `https://${host}/x-banner.jpg` : undefined;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" },
      { name: "applicable-device", content: "pc,mobile" },
      { name: "MobileOptimized", content: "width" },
      { name: "HandheldFriendly", content: "true" },
      { name: "x5-orientation", content: "portrait" },
      { name: "screen-orientation", content: "portrait" },
      { title: APP_NAME },
      { name: "description", content: "猛蹬·145 · 我就看智商能低到什么程度 · IQ bench for OpenAI-compatible APIs. 100 = half right." },
      { name: "apple-mobile-web-app-title", content: APP_NAME },
      { name: "theme-color", content: "#16130e" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "猛蹬·145 · Mengdeng 145" },
      { name: "twitter:description", content: "How low can model IQ go? Paste an OpenAI-compatible key. Pelican on a bike. No key stored." },
      { property: "og:title", content: "猛蹬·145 · Mengdeng 145" },
      { property: "og:description", content: "我就看智商能低到什么程度 · IQ bench, 100 = half right, max 145." },
      ...(ogImage
        ? [
            { name: "twitter:image", content: ogImage },
            { property: "og:image", content: ogImage },
            { property: "og:image:width", content: "1200" },
            { property: "og:image:height", content: "630" },
          ]
        : []),
      ...(xBanner
        ? [
            { property: "x:game:image", content: xBanner },
            { property: "x:game:image:width", content: "1200" },
            { property: "x:game:image:height", content: "264" },
          ]
        : []),
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "apple-touch-icon", href: "/icon-180.png" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
    ],
  }),
  component: () => (
    <html lang="zh-CN" className="is-narrow antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ViewportLock />
        <PreviewHostBridge />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <footer className="border-t border-border/70">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-muted sm:px-6">
            <span>猛蹬·145</span>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <a
                href="https://github.com/yclenove/iqbench"
                target="_blank"
                rel="noreferrer"
                className="text-fg underline decoration-primary/50 underline-offset-2 transition-colors hover:text-primary"
              >
                GitHub
              </a>
              <span className="text-faint">·</span>
              <span>友情链接</span>
              <a
                href="https://linux.do"
                target="_blank"
                rel="noreferrer"
                className="text-fg underline decoration-primary/50 underline-offset-2 transition-colors hover:text-primary"
              >
                LINUX DO
              </a>
              <span className="text-faint">·</span>
              <a
                href="https://htbike.amiibot.com/"
                target="_blank"
                rel="noreferrer"
                className="text-fg underline decoration-primary/50 underline-offset-2 transition-colors hover:text-primary"
              >
                鹈鹕骑车榜
              </a>
            </p>
          </div>
        </footer>
        <Scripts />
      </body>
    </html>
  ),
});
