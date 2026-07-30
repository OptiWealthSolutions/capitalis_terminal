
import { AbsoluteFill, Img, staticFile, useCurrentFrame, interpolate, Easing } from "remotion";

export const Scene5_Outro = () => {
  const frame = useCurrentFrame();
  
  return (
    <AbsoluteFill style={{ backgroundColor: "#0A0A0C", justifyContent: 'center', alignItems: 'center', fontFamily: "'JetBrains Mono', monospace" }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ transform: `scale(${interpolate(frame, [0, 60], [0.95, 1], { easing: Easing.out(Easing.ease) })})` }}>
          <Img src={staticFile("logo_hc.png")} style={{ width: 140, height: 140, marginBottom: 40 }} />
        </div>
        
        <div style={{ fontSize: 64, fontWeight: 700, color: '#EAEAEA', letterSpacing: '0.1em', marginBottom: 20 }}>
          HORACLE CAPITAL
        </div>
        <div style={{ fontSize: 18, color: '#F97316', letterSpacing: '0.4em', marginBottom: 60 }}>
          DATA-DRIVEN RESEARCH
        </div>

        <div style={{
          border: '1px solid #2A2A35',
          padding: '20px 60px',
          color: '#EAEAEA',
          fontSize: 24,
          display: 'inline-block',
          backgroundColor: '#111115'
        }}>
          HORACLECAPITAL.COM
        </div>
      </div>
    </AbsoluteFill>
  );
};
