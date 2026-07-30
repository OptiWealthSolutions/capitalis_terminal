
import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from "remotion";

export const Scene4_TerminalUI = () => {
  const frame = useCurrentFrame();
  const browserScale = interpolate(frame, [0, 40], [0.95, 1], { easing: Easing.bezier(0.16, 1, 0.3, 1) });

  return (
    <AbsoluteFill style={{ backgroundColor: "#0A0A0C", padding: 60, fontFamily: "'JetBrains Mono', monospace" }}>
       <div style={{
         width: '100%',
         height: '100%',
         backgroundColor: '#111115',
         border: '1px solid #2A2A35',
         borderRadius: 4,
         transform: `scale(${browserScale})`,
         display: 'flex',
         overflow: 'hidden'
       }}>
         {/* Minimal Sidebar */}
         <div style={{ width: 80, backgroundColor: '#0A0A0C', borderRight: '1px solid #2A2A35', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 30 }}>
            {[1,2,3,4].map(i => (
              <div key={i} style={{ width: 32, height: 32, borderRadius: 4, border: '1px solid #2A2A35', marginBottom: 20, backgroundColor: i === 1 ? '#F97316' : 'transparent' }} />
            ))}
         </div>
         
         {/* Main Content Area */}
         <div style={{ flex: 1, padding: 40 }}>
            <div style={{ height: 30, width: '40%', backgroundColor: '#18181E', marginBottom: 40, border: '1px solid #2A2A35' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 30 }}>
               {Array(6).fill(0).map((_, i) => (
                 <div key={i} style={{ height: 180, backgroundColor: '#18181E', border: '1px solid #2A2A35', padding: 24 }}>
                    <div style={{ height: 8, width: '30%', backgroundColor: '#2A2A35', marginBottom: 15 }} />
                    <div style={{ height: 24, width: '60%', backgroundColor: '#2A2A35' }} />
                 </div>
               ))}
            </div>
         </div>
       </div>

       <div style={{
         position: 'absolute',
         bottom: 100,
         left: '50%',
         transform: 'translateX(-50%)',
         backgroundColor: '#F97316',
         color: 'white',
         padding: '16px 40px',
         fontSize: 24,
         fontWeight: 700,
         opacity: interpolate(frame, [50, 70], [0, 1])
       }}>
         TERMINAL_CAPITALIS.EXE
       </div>
    </AbsoluteFill>
  );
};
