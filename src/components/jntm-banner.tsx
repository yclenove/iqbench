/** 鸡你太美舞台：完整 HTML/CSS 动画，iframe 才能播 keyframes。 */
export function JntmBanner() {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <iframe
        title="鸡你太美：鹈鹕骑自行车"
        src="/jntm.html"
        className="block h-[min(72vh,640px)] w-full border-0 bg-[#180b2c]"
      />
    </div>
  );
}