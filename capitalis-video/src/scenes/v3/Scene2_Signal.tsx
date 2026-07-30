
import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from "remotion";

export const Scene2_Signal = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 20], [0, 1]);
  
  return (
    <AbsoluteFill style={{ backgroundColor: "#0A0A0C", display: 'flex', justifyContent: 'center', alignItems: 'center', fontFamily: "'JetBrains Mono', monospace" }}>
      <div style={{
        textAlign: 'center',
        opacity,
        transform: `scale(${interpolate(frame, [0, 90], [0.98, 1])})`
      }}>
        <div style={{ fontSize: 100, fontWeight: 800, color: "#EAEAEA", letterSpacing: '-0.05em', marginBottom: 20 }}>
          SIGNAL, PAS BRUIT.
        </div>
        <div style={{ fontSize: 24, color: "#F97316", letterSpacing: '0.4em' }}>
          QUANTITATIVE CLARITY
        </div>
      </div>
      
      {/* Background technical grid */}
      <AbsoluteFill style={{ opacity: 0.1, zIndex: -1 }}>
        <div style={{ width: '100%', height: '100%', backgroundImage: 'linear-gradient(#2A2A35 1px, transparent 1px), linear-gradient(90deg, #2A2A35 1px, transparent 1px)', backgroundSize: '100px 100px' }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
