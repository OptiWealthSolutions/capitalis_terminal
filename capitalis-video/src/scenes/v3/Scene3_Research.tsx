
import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from "remotion";

const Stat = ({ label, value, delay }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [delay, delay + 20], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <div style={{ opacity, borderBottom: '1px solid #2A2A35', padding: '24px 0' }}>
      <div style={{ color: '#8A8A9A', fontSize: 14, marginBottom: 8 }}>{label}</div>
      <div style={{ color: '#EAEAEA', fontSize: 32, fontWeight: 600 }}>{value}</div>
    </div>
  );
};

export const Scene3_Research = () => {
  const frame = useCurrentFrame();
  
  return (
    <AbsoluteFill style={{ backgroundColor: "#0A0A0C", padding: 80, fontFamily: "'JetBrains Mono', monospace" }}>
      <div style={{ display: 'flex', gap: 60, height: '100%' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 48, color: '#EAEAEA', marginBottom: 40, borderLeft: '4px solid #F97316', paddingLeft: 30 }}>
            MACRO <br/> RESEARCH
          </div>
          <div style={{ color: '#8A8A9A', fontSize: 18, lineHeight: 1.6 }}>
            Analyse rigoureuse de la politique monétaire et des cycles économiques mondiaux.
          </div>
        </div>
        
        <div style={{ flex: 1.5, backgroundColor: '#111115', border: '1px solid #2A2A35', borderRadius: 4, padding: 40 }}>
           <Stat label="REGIME_DETECTION" value="HIDDEN_MARKOV_MODEL" delay={10} />
           <Stat label="MARKET_ALPHA" value="SYSTEMATIC_BACKTEST" delay={25} />
           <Stat label="RISK_SCORING" value="MULTI_FACTOR_V2" delay={40} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
