
import { AbsoluteFill, useCurrentFrame, interpolate, Easing, Audio } from "remotion";
import React from "react";

const StatCard = ({ title, value, delay }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [delay, delay + 25], [0, 1]);
  const y = interpolate(frame, [delay, delay + 25], [30, 0], { easing: Easing.bezier(0.16, 1, 0.3, 1) });

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${y}px)`,
        backgroundColor: "rgba(255, 255, 255, 0.8)",
        backdropFilter: "blur(12px)",
        borderRadius: 24,
        padding: 40,
        boxShadow: "0 10px 30px rgba(15,23,42,0.05)",
        border: "1px solid rgba(15,23,42,0.08)",
        width: 380,
        textAlign: "left",
      }}
    >
      <div style={{ fontSize: 22, color: "#737685", fontWeight: 600, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
      <div style={{ fontSize: 64, fontWeight: 800, color: "#0B1C33", letterSpacing: '-0.02em' }}>{value}</div>
    </div>
  );
};

const LineChart = ({ delay }) => {
    const frame = useCurrentFrame();
    const opacity = interpolate(frame, [delay, delay + 30], [0, 1]);
    const scale = interpolate(frame, [delay, delay + 40], [0.98, 1], { easing: Easing.bezier(0.16, 1, 0.3, 1) });

    return (
        <div style={{ 
            opacity, 
            transform: `scale(${scale})`,
            width: 1200, 
            height: 400, 
            backgroundColor: 'white', 
            borderRadius: 32, 
            padding: 60, 
            boxShadow: "0 20px 60px rgba(15,23,42,0.06)", 
            border: "1px solid rgba(15,23,42,0.06)", 
            position: 'relative',
            overflow: 'hidden'
        }}>
            <svg width="100%" height="100%" viewBox="0 0 1000 300">
                <defs>
                    <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgba(0, 53, 148, 0.1)" />
                        <stop offset="100%" stopColor="rgba(0, 53, 148, 0)" />
                    </linearGradient>
                </defs>
                <path
                    d="M0,250 C100,200 200,280 300,150 C400,100 500,180 600,80 C700,50 800,120 1000,20"
                    fill="url(#chartGradient)"
                />
                <path
                    fill="none"
                    stroke="#003594"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M0,250 C100,200 200,280 300,150 C400,100 500,180 600,80 C700,50 800,120 1000,20"
                    strokeDasharray={2000}
                    strokeDashoffset={interpolate(frame, [delay + 30, delay + 120], [2000, 0], { easing: Easing.bezier(0.16, 1, 0.3, 1) })}
                />
            </svg>
        </div>
    )
}

export const ShareAndTrack = () => {
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
        Partager et Tracker
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: 40, marginBottom: 60 }}>
        <StatCard title="Total Returns" value="+24.8%" delay={30} />
        <StatCard title="Alpha" value="4.2" delay={45} />
        <StatCard title="Sharpe" value="2.1" delay={60} />
      </div>

      <div style={{ display: "flex", justifyContent: "center" }}>
        <LineChart delay={80} />
      </div>
    </AbsoluteFill>
  );
};
