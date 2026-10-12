"use client";

import { useEffect, useRef, useState } from "react";

/** Draw-to-sign pad (mouse, touch or pen). Emits a PNG data URL after each stroke, or null when cleared. */
export function SignaturePad({ onChange }: { onChange: (png: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  const reset = () => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#0e131a";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  };
  useEffect(reset, []);

  const pos = (e: React.PointerEvent) => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };

  return (
    <div>
      <canvas
        ref={ref}
        width={640}
        height={200}
        aria-label="Signature pad. Draw your signature here with a finger, pen or mouse."
        className="w-full touch-none rounded-md border border-ink-500 bg-white"
        style={{ aspectRatio: "640 / 200" }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          const { x, y } = pos(e);
          const ctx = ref.current!.getContext("2d")!;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 0.1, y + 0.1);
          ctx.stroke();
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const { x, y } = pos(e);
          const ctx = ref.current!.getContext("2d")!;
          ctx.lineTo(x, y);
          ctx.stroke();
        }}
        onPointerUp={() => {
          if (!drawing.current) return;
          drawing.current = false;
          setEmpty(false);
          onChange(ref.current!.toDataURL("image/png"));
        }}
      />
      <button type="button" className="mt-2 min-h-[44px] text-sm text-mist-strong underline" disabled={empty}
        onClick={() => { reset(); setEmpty(true); onChange(null); }}>
        Clear signature
      </button>
    </div>
  );
}
