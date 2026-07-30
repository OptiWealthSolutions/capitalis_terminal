
import { AbsoluteFill, useCurrentFrame, interpolate, Easing, Audio } from "remotion";
import React from "react";

const Card = ({ ticker, name, delay, selected }) => {
  const frame = useCurrentFrame();

  const entryOpacity = interpolate(frame, [delay, delay + 20], [0, 1]);
  const entryScale = interpolate(frame, [delay, delay + 20], [0.8, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  const selectionScale = selected 
    ? interpolate(frame, [delay + 60, delay + 80], [1, 1.15], { easing: Easing.bezier(0.33, 1, 0.68, 1), extrapolateRight: 'clamp' })
    : 1;

  const glowOpacity = selected
    ? interpolate(frame, [delay + 60, delay + 80], [0, 1], { extrapolateRight: 'clamp' })
    : 0;

  return (
    <div
      style={{
        opacity: entryOpacity,
        transform: `scale(${entryScale * selectionScale})`,
        backgroundColor: "white",
        borderRadius: 24,
        padding: 32,
        boxShadow: selected 
          ? `0 20px 50px rgba(0, 53, 148, ${glowOpacity * 0.2})`
          : `0 8px 24px rgba(15,23,42,0.06)`,
        border: selected ? "2px solid #003594" : "1px solid rgba(15,23,42,0.08)",
        width: 320,
        height: 200,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        fontFamily: "Manrope, sans-serif",
        position: 'relative'
      }}
    >
      <div style={{ fontSize: 48, fontWeight: 800, color: selected ? "#003594" : "#0B1C33", marginBottom: 8 }}>{ticker}</div>
      <div style={{ fontSize: 20, color: "#737685", fontWeight: 500 }}>{name}</div>
    </div>
  );
};

export const Choose = () => {
  const frame = useCurrentFrame();
  const titleOpacity = interpolate(frame, [0, 30], [0, 1]);
  const titleY = interpolate(frame, [0, 30], [-20, 0], { easing: Easing.bezier(0.16, 1, 0.3, 1) });

  return (
    <AbsoluteFill style={{ backgroundColor: "#F9F9FF", padding: 80 }}>
      <div
        style={{
          width: "100%",
          textAlign: "center",
          fontFamily: `"Manrope", sans-serif`,
          fontSize: 80,
          fontWeight: 800,
          color: "#0B1C33",
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          marginBottom: 80,
          letterSpacing: "-0.03em",
        }}
      >
        Choisir le meilleur
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 48,
          justifyItems: "center",
          perspective: "1000px"
        }}
      >
        <Card ticker="AAPL" name="Apple Inc." delay={10} />
        <Card ticker="NVDA" name="NVIDIA Corp." delay={20} selected />
        <Card ticker="MSFT" name="Microsoft" delay={30} />
        <Card ticker="TSLA" name="Tesla, Inc." delay={40} />
        <Card ticker="GOOGL" name="Alphabet Inc." delay={50} />
        <Card ticker="AMZN" name="Amazon.com" delay={60} />
      </div>
    </AbsoluteFill>
  );
};
