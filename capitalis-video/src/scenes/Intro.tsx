
import { AbsoluteFill, Img, staticFile, useCurrentFrame, interpolate, Easing, Audio } from "remotion";

export const Intro = () => {
  const frame = useCurrentFrame();

  // Logo Reveal: Smooth scale down + fade in
  const logoOpacity = interpolate(frame, [0, 45], [0, 1], {
    easing: Easing.bezier(0.33, 1, 0.68, 1),
  });
  const logoScale = interpolate(frame, [0, 60], [1.2, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  // Tagline Slide: Upward movement + staggered fade
  const taglineOpacity = interpolate(frame, [45, 75], [0, 1]);
  const taglineY = interpolate(frame, [45, 75], [40, 0], {
    easing: Easing.out(Easing.quad),
  });

  // Background Dim: Start dark and lighten slightly
  const bgColor = "#0B1C33"; // Deep Capitalis Navy
  const overlayOpacity = interpolate(frame, [0, 90], [1, 0]);

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      
      {/* Ambient background glow */}
      <div
        style={{
          position: "absolute",
          width: 800,
          height: 800,
          background: "radial-gradient(circle, rgba(0, 53, 148, 0.15) 0%, transparent 70%)",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          opacity: logoOpacity,
        }}
      />

      <AbsoluteFill
        style={{
          transform: `scale(${logoScale})`,
          opacity: logoOpacity,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Img
          src={staticFile("logo.png")}
          style={{
            width: 320,
            height: 320,
            filter: "drop-shadow(0 0 20px rgba(0, 53, 148, 0.3))",
          }}
        />
      </AbsoluteFill>

      <div
        style={{
          fontFamily: `"Manrope", sans-serif`,
          fontSize: 54,
          fontWeight: 700,
          textAlign: "center",
          position: "absolute",
          width: "100%",
          top: "70%",
          opacity: taglineOpacity,
          transform: `translateY(${taglineY}px)`,
          color: "#F9F9FF",
          letterSpacing: "-0.02em",
        }}
      >
        The Future of Institutional Finance
      </div>
    </AbsoluteFill>
  );
};
