
import { AbsoluteFill, useCurrentFrame, interpolate, Easing, Audio } from "remotion";
import React from "react";

const Slice = ({ radius, strokeWidth, percentage, color, delay }) => {
  const frame = useCurrentFrame();
  const circumference = 2 * Math.PI * radius;
  
  const entryScale = interpolate(frame, [delay, delay + 30], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateRight: 'clamp'
  });

  const strokeDashoffset = interpolate(
    frame,
    [delay + 10, delay + 70],
    [circumference, circumference * (1 - percentage)],
    { easing: Easing.bezier(0.33, 1, 0.68, 1), extrapolateRight: 'clamp' }
  );

  return (
    <g style={{ transform: `scale(${entryScale})`, transformOrigin: 'center' }}>
      <circle
        cx={radius}
        cy={radius}
        r={radius - strokeWidth / 2}
        fill="transparent"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        transform={`rotate(-90 ${radius} ${radius})`}
        strokeLinecap="round"
      />
    </g>
  );
};

const PieChart = ({ data }) => {
  const radius = 240;
  const strokeWidth = 80;

  let accumulatedPercentage = 0;

  return (
    <div style={{ position: 'relative' }}>
      <svg width={radius * 2} height={radius * 2} viewBox={`0 0 ${radius*2} ${radius*2}`} style={{ filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.08))" }}>
        {data.map((item, index) => {
          const rotation = accumulatedPercentage * 360;
          accumulatedPercentage += item.percentage;
          return (
            <g key={index} transform={`rotate(${rotation} ${radius} ${radius})`}>
              <Slice
                radius={radius}
                strokeWidth={strokeWidth}
                percentage={item.percentage}
                color={item.color}
                delay={20 + index * 15}
              />
            </g>
          );
        })}
      </svg>
      {/* Center content for Donut style */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center',
        fontFamily: 'Manrope, sans-serif'
      }}>
        <div style={{ fontSize: 24, color: '#737685', fontWeight: 600 }}>Total</div>
        <div style={{ fontSize: 64, fontWeight: 800, color: '#0B1C33' }}>100%</div>
      </div>
    </div>
  );
};

export const Allocate = () => {
  const frame = useCurrentFrame();
  const titleOpacity = interpolate(frame, [0, 30], [0, 1]);
  const titleY = interpolate(frame, [0, 30], [-20, 0], { easing: Easing.bezier(0.16, 1, 0.3, 1) });

  const data = [
    { percentage: 0.45, color: "#003594" },
    { percentage: 0.25, color: "#16A34A" },
    { percentage: 0.20, color: "#D97706" },
    { percentage: 0.10, color: "#BA1A1A" },
  ];

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
          marginBottom: 100,
          letterSpacing: "-0.03em",
        }}
      >
        Allouer intelligemment
      </div>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", top: 100 }}>
        <PieChart data={data} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
