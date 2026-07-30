
import { AbsoluteFill, Img, staticFile, useCurrentFrame, interpolate, Easing, Audio } from "remotion";

export const Outro = () => {
  const frame = useCurrentFrame();

  const ctaOpacity = interpolate(frame, [0, 45], [0, 1], { easing: Easing.bezier(0.16, 1, 0.3, 1) });
  const ctaScale = interpolate(frame, [0, 45], [0.9, 1], { easing: Easing.bezier(0.175, 0.885, 0.32, 1.275) });

  const logoOpacity = interpolate(frame, [45, 75], [0, 1]);
  const logoScale = interpolate(frame, [45, 75], [0.8, 1], {
    easing: Easing.elastic(1),
  });

  const urlOpacity = interpolate(frame, [75, 105], [0, 1]);
  const urlY = interpolate(frame, [75, 105], [20, 0], { easing: Easing.out(Easing.quad) });

  return (
    <AbsoluteFill style={{ backgroundColor: "#F9F9FF" }}>
      
      <div
        style={{
          width: "100%",
          textAlign: "center",
          position: "absolute",
          top: "25%",
          fontFamily: `"Manrope", sans-serif`,
          fontSize: 84,
          fontWeight: 800,
          color: "#0B1C33",
          opacity: ctaOpacity,
          transform: `scale(${ctaScale})`,
          letterSpacing: "-0.04em",
        }}
      >
        Rejoignez l'élite financière.
      </div>

      <AbsoluteFill
        style={{
          transform: `scale(${logoScale})`,
          opacity: logoOpacity,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          top: 80
        }}
      >
        <Img
          src={staticFile("logo.png")}
          style={{
            width: 240,
            height: 240,
            filter: "drop-shadow(0 20px 40px rgba(0, 53, 148, 0.15))",
          }}
        />
      </AbsoluteFill>

      <div
        style={{
          fontFamily: `"Manrope", sans-serif`,
          fontSize: 48,
          fontWeight: 700,
          textAlign: "center",
          position: "absolute",
          width: "100%",
          bottom: "15%",
          opacity: urlOpacity,
          transform: `translateY(${urlY}px)`,
          color: "#003594",
          letterSpacing: "-0.01em",
        }}
      >
        capitalis.io
      </div>
    </AbsoluteFill>
  );
};
