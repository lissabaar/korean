/**
 * The app icon as a picture for ImageResponse (next/og): a celadon square
 * with a white "K". Used for the home-screen icons — the manifest's
 * /pwa-icon/192 and /pwa-icon/512 (app/pwa-icon/[size]/route.tsx) and
 * iPhone's apple-icon (app/apple-icon.tsx).
 *
 * Library module (server: rendered to PNG by ImageResponse). Latin letter
 * only: ImageResponse's built-in font has no Hangul.
 */

/** The icon at `size` pixels square. Fills the whole square, so it also works as a maskable icon. */
export function appIcon(size: number) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#3c5f52",
        color: "#f3f5f3",
        fontSize: Math.round(size * 0.56),
        fontWeight: 700,
      }}
    >
      K
    </div>
  );
}
