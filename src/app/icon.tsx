import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

const BOLT_PATH = "M15 2 L4 13.5 L10.5 13.5 L8 22 L20 10.5 L13.5 10.5 Z";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(circle at 50% 38%, #1f1f1f 0%, #050505 100%)",
          borderRadius: 7,
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24">
          <defs>
            <linearGradient id="bolt" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#bdbdbd" />
            </linearGradient>
          </defs>
          <path
            d={BOLT_PATH}
            fill="#ffffff"
            opacity="0.18"
            transform="translate(12 12) scale(1.22) translate(-12 -12)"
          />
          <path d={BOLT_PATH} fill="url(#bolt)" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
