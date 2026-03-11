import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Aria - The CRM your AI agent already knows how to use";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(145deg, #0c0c12 0%, #0e1018 50%, #0c0c14 100%)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Glow */}
        <div
          style={{
            position: "absolute",
            width: 500,
            height: 500,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(99, 102, 241, 0.3) 0%, transparent 70%)",
            top: "5%",
            left: "35%",
          }}
        />

        {/* Logo mark + text */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "linear-gradient(145deg, #6366f1, #4f46e5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
              fontWeight: 800,
              color: "#fff",
            }}
          >
            A
          </div>
          <span style={{ fontSize: 72, fontWeight: 700, color: "#f0f0f5", letterSpacing: -2 }}>
            Aria
          </span>
        </div>

        {/* Tagline */}
        <p style={{ fontSize: 28, color: "#9ca3af", margin: 0 }}>
          The CRM your AI agent already knows how to use.
        </p>

        {/* Pills */}
        <div
          style={{
            display: "flex",
            gap: 12,
            marginTop: 40,
          }}
        >
          {["Agent Integration", "Self-Hosted", "AI Built In", "REST API"].map(
            (label) => (
              <div
                key={label}
                style={{
                  padding: "8px 20px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.03)",
                  color: "#9ca3af",
                  fontSize: 18,
                }}
              >
                {label}
              </div>
            )
          )}
        </div>
      </div>
    ),
    { ...size }
  );
}
