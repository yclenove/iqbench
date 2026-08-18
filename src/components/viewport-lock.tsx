import { useEffect } from "react";

function measure() {
  const visual = window.visualViewport?.width;
  const w = Math.min(
    visual || Number.POSITIVE_INFINITY,
    window.innerWidth || Number.POSITIVE_INFINITY,
    document.documentElement.clientWidth || Number.POSITIVE_INFINITY,
    screen.width || Number.POSITIVE_INFINITY,
  );
  const width = Number.isFinite(w) && w > 0 ? Math.round(w) : 390;
  const root = document.documentElement;
  root.style.setProperty("--app-w", `${width}px`);
  root.classList.toggle("is-narrow", width < 840);
}

export function ViewportLock() {
  useEffect(() => {
    measure();
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    const t = window.setTimeout(measure, 80);
    const t2 = window.setTimeout(measure, 400);
    return () => {
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
      window.clearTimeout(t);
      window.clearTimeout(t2);
    };
  }, []);
  return null;
}
