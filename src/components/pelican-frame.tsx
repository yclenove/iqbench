import { memo, useEffect, useRef } from "react";
import { fitGallerySvgs, galleryPaint } from "@/lib/judge";

const SHELL = `
:host{display:block;width:100%;height:100%;background:#d9eefc;overflow:hidden}
.stage{position:relative;width:100%;height:100%}
.stage svg{position:absolute;inset:0;width:100%;height:100%;display:block}
`;

function PelicanFrame({
  html,
  svg,
  title,
  hero,
}: {
  html?: string;
  svg?: string;
  title: string;
  hero?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const paint = galleryPaint(html, svg);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    let live = false;

    const mount = () => {
      if (live) return;
      live = true;
      shadow.innerHTML = paint
        ? `<style>${SHELL}</style>${paint}`
        : `<style>${SHELL}</style><p style="margin:0;height:100%;display:grid;place-items:center;color:#64748b;font:14px sans-serif">没有画面</p>`;
      requestAnimationFrame(() => fitGallerySvgs(shadow));
    };
    const eachSvg = (fn: (el: SVGSVGElement) => void) => {
      shadow.querySelectorAll("svg").forEach((n) => fn(n as SVGSVGElement));
    };
    const sleep = () => eachSvg((el) => el.pauseAnimations?.());
    const wake = () => eachSvg((el) => el.unpauseAnimations?.());
    const drop = () => {
      if (!live) return;
      live = false;
      shadow.innerHTML = `<style>${SHELL}</style>`;
    };

    const io = new IntersectionObserver(
      ([e]) => {
        if (!e) return;
        if (e.isIntersecting) {
          mount();
          wake();
          return;
        }
        sleep();
        const far =
          e.boundingClientRect.bottom < -480 || e.boundingClientRect.top > window.innerHeight + 480;
        if (far) drop();
      },
      { rootMargin: "240px 0px", threshold: 0.01 },
    );
    io.observe(host);
    return () => {
      io.disconnect();
      shadow.innerHTML = "";
    };
  }, [paint]);

  return (
    <div
      ref={hostRef}
      className={`salon-frame ${hero ? "salon-frame-hero" : ""}`}
      role="img"
      aria-label={title}
    />
  );
}

const PelicanLive = memo(PelicanFrame);
const PelicanStill = PelicanLive;

export { PelicanLive, PelicanStill };
