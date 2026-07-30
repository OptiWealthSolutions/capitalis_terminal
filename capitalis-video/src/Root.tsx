
import "./index.css";
import { Composition } from "remotion";
import { VideoV3 } from "./VideoV3";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="HoracleInstitutionalV3"
        component={VideoV3}
        durationInFrames={630}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
