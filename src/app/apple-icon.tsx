import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const BOLT_PATH = "M15 2 L4 13.5 L10.5 13.5 L8 22 L20 10.5 L13.5 10.5 Z";

export default function AppleIcon() {
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
          borderRadius: 40,
          boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.08)",
        }}
      >
        <svg width="130" height="130" viewBox="0 0 24 24">
          <defs>
            <linearGradient id="bolt" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#bdbdbd" />
            </linearGradient>
            <radialGradient id="aura" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="12" cy="12" r="11" fill="url(#aura)" />
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
