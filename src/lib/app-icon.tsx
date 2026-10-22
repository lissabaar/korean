/**
 * The INLEX icon as a picture for ImageResponse (next/og): a bold lowercase
 * "in" in white on a deep celadon gradient, with a light highlighter stroke
 * under it — a word marked in a text, which is what the app is about (words
 * picked from what you read). Used for every icon: the browser tab
 * (app/icon.tsx), the home-screen icons named in the manifest
 * (/pwa-icon/192, /pwa-icon/512), iPhone's apple-icon and the link preview.
 *
 * Library module (server: rendered to PNG by ImageResponse). The letters are
 * drawn (an SVG path), not typed: ImageResponse's built-in font has no bold
 * weight and looked thin, and boxes with rounded borders left seams. The picture fills the
 * whole square — phones cut their own shape out of it (maskable), so the
 * mark keeps clear of the edges.
 */

const INK = "#f6f8f6";
const MARK = "#c7e3d4";

/** The icon at `size` pixels square. */
export function appIcon(size: number) {
  const u = size / 100;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(140deg, #6a9a85 0%, #3c5f52 55%, #2a4239 100%)",
      }}
    >
      {/* "in" as one vector drawing (no seams where shapes meet): the i's
          dot and stem, the n's stem and arch, all in one stroke weight. */}
      <svg width={52 * u} height={50 * u} viewBox="0 0 52 50" style={{ marginTop: -4 * u }}>
        <circle cx="6" cy="6" r="5.5" fill={INK} />
        <path d="M6 19 V44" stroke={INK} strokeWidth="11" strokeLinecap="round" fill="none" />
        <path d="M25 44 V30 A10.5 10.5 0 0 1 46 30 V44" stroke={INK} strokeWidth="11" strokeLinecap="round" fill="none" />
      </svg>
      {/* The highlighter stroke under the word. */}
      <div
        style={{
          display: "flex",
          width: 50 * u,
          height: 7 * u,
          marginTop: 7 * u,
          borderRadius: 4 * u,
          background: MARK,
        }}
      />
    </div>
  );
}
