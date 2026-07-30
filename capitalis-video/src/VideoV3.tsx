
import { Series } from "remotion";
import { Scene1_Boot } from "./scenes/v3/Scene1_Boot";
import { Scene2_Signal } from "./scenes/v3/Scene2_Signal";
import { Scene3_Research } from "./scenes/v3/Scene3_Research";
import { Scene4_TerminalUI } from "./scenes/v3/Scene4_TerminalUI";
import { Scene5_Outro } from "./scenes/v3/Scene5_Outro";

export const VideoV3 = () => {
  return (
    <Series>
      <Series.Sequence durationInFrames={120}>
        <Scene1_Boot />
      </Series.Sequence>
      <Series.Sequence durationInFrames={120}>
        <Scene2_Signal />
      </Series.Sequence>
      <Series.Sequence durationInFrames={120}>
        <Scene3_Research />
      </Series.Sequence>
      <Series.Sequence durationInFrames={150}>
        <Scene4_TerminalUI />
      </Series.Sequence>
      <Series.Sequence durationInFrames={120}>
        <Scene5_Outro />
      </Series.Sequence>
    </Series>
  );
};
