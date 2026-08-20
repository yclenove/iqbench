import { useEffect, useRef, useState } from "react";

/** 鸡你太美舞台：进视口才挂 iframe，滚走就卸，避免整页 SMIL/CSS 动画拖卡。 */
export function JntmBanner() {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => setOn(Boolean(e?.isIntersecting)),
      { rootMargin: "120px 0px", threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="overflow-hidden rounded-xl border border-border bg-[#180b2c]">
      {on ? (
        <iframe
          title="鸡你太美：鹈鹕骑自行车"
          src="/jntm.html"
          className="block h-[min(42vh,360px)] w-full border-0 bg-[#180b2c]"
        />
      ) : (
        <div className="grid h-[min(42vh,360px)] place-items-center text-sm text-white/40">舞台候场</div>
      )}
    </div>
  );
}