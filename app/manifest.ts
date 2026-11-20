import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NexusLedger ERP",
    short_name: "NexusLedger",
    description: "Multi-warehouse inventory and automated supply chain accounting.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#07111f",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
