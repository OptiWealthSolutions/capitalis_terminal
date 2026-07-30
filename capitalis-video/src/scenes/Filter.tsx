
import { AbsoluteFill, useCurrentFrame, interpolate, Easing, Audio, staticFile } from "remotion";
import React from "react";

const FilterOption = ({ children, delay, selected }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [delay, delay + 15], [0, 1]);
  const scale = interpolate(frame, [delay, delay + 15], [0.95, 1], {
    easing: Easing.bezier(0.175, 0.885, 0.32, 1.275),
  });

  const bgColor = selected ? "#003594" : "white";
  const textColor = selected ? "white" : "#0B1C33";
  const border = selected ? "none" : "1px solid rgba(15,23,42,0.1)";

  return (
    <div
      style={{
        opacity,
        transform: `scale(${scale})`,
        fontSize: 32,
        fontWeight: 500,
        backgroundColor: bgColor,
        color: textColor,
        padding: "16px 32px",
        borderRadius: 100,
        marginBottom: 16,
        boxShadow: "0 4px 12px rgba(15,23,42,0.04)",
        border: border,
        display: "flex",
        alignItems: "center",
        fontFamily: "DM Sans, sans-serif",
      }}
    >
      {children}
    </div>
  );
};

export const Filter = () => {
  const frame = useCurrentFrame();

  const titleOpacity = interpolate(frame, [0, 30], [0, 1]);
  const titleY = interpolate(frame, [0, 30], [20, 0], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#F9F9FF", padding: 80 }}>
      <div
        style={{
          fontFamily: `"Manrope", sans-serif`,
          fontSize: 80,
          fontWeight: 800,
          color: "#0B1C33",
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          marginBottom: 60,
          letterSpacing: "-0.03em",
        }}
      >
        Filtrer avec précision
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
        <FilterOption delay={30} selected>Technology Sector</FilterOption>
        <FilterOption delay={40}>Market Cap {'>'} $100B</FilterOption>
        <FilterOption delay={50}>P/E Ratio {'<'} 25</FilterOption>
        <FilterOption delay={60}>ESG Score: Triple A</FilterOption>
      </div>
    </AbsoluteFill>
  );
};
