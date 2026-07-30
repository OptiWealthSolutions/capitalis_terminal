
import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from "remotion";

export const Scene1_Boot = () => {
  const frame = useCurrentFrame();
  const text = "> HORACLE_SYSTEM_v4.0_INIT...";
  const chars = Math.floor(interpolate(frame, [0, 40], [0, text.length], { extrapolateRight: 'clamp' }));
  
  return (
    <AbsoluteFill style={{ backgroundColor: "#0A0A0C", padding: 100, fontFamily: "'JetBrains Mono', monospace" }}>
      <div style={{ fontSize: 32, color: "#F97316", letterSpacing: '0.1em' }}>
        {text.substring(0, chars)}
        {Math.round(frame / 15) % 2 === 0 && "_"}
      </div>
      
      <div style={{ marginTop: 40, color: "#8A8A9A", fontSize: 18, opacity: interpolate(frame, [40, 60], [0, 1]) }}>
        [ OK ] Loading Macro Engine...<br/>
        [ OK ] Connecting Quantitative Filters...<br/>
        [ OK ] Establishing Real-time Ticker...
      </div>
    </AbsoluteFill>
  );
};
