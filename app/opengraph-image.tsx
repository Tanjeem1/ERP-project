import { ImageResponse } from "next/og";

export const alt = "NexusLedger ERP: Multi-warehouse inventory and automated accounting";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#07111f", color: "white", fontFamily: "Arial, sans-serif", padding: "64px 72px", border: "1px solid #334155" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, background: "#34d399", color: "#07111f", fontSize: 28, fontWeight: 600 }}>N</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 30, fontWeight: 600, letterSpacing: -1 }}>NexusLedger <span style={{ color: "#94a3b8", fontSize: 18 }}>ERP</span></div>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ maxWidth: 960, fontSize: 64, lineHeight: 1.08, fontWeight: 600, letterSpacing: -2 }}>Multi-warehouse inventory with automated FIFO accounting.</div>
        <div style={{ marginTop: 26, color: "#94a3b8", fontSize: 24 }}>Landed cost allocation · Stock reservations · Double entry</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#cbd5e1", fontSize: 17 }}><div style={{ width: 9, height: 9, borderRadius: 9, background: "#34d399" }} />Interactive ERP demo. No login required.</div>
    </div>,
    size,
  );
}
