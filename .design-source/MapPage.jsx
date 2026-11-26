import React, { useCallback, useState } from "react";
import MapView from "./MapView";
import GlobeView from "./GlobeView";
import "./globe.css";

const MODE_KEY = "terra-map-mode";

function readMode() {
  try {
    return localStorage.getItem(MODE_KEY) === "district" ? "district" : "globe";
  } catch {
    return "globe";
  }
}

function writeMode(mode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Storage can be unavailable (private windows); the choice then just lasts for this visit.
  }
}

// If the globe throws while rendering, drop back to the district map instead of blanking the page.
class GlobeBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error("Globe view crashed:", error);
    this.props.onFail("an unexpected error occurred");
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

// The Map tab. The globe is the default; the original district map is one click away
// and is also what you get automatically if the globe cannot start on this device.
export default function MapPage({ plots, onSelectView }) {
  const [mode, setMode] = useState(readMode);
  const [notice, setNotice] = useState("");

  const handleFail = useCallback((reason) => {
    setNotice(`Globe view is unavailable (${reason}). Showing the district map instead.`);
    setMode("district");
  }, []);

  const choose = (next) => {
    setNotice("");
    setMode(next);
    writeMode(next);
  };

  return (
    <div>
      <div className="mapmode" role="group" aria-label="Map style">
        <button className="chip" aria-pressed={mode === "globe"} onClick={() => choose("globe")}>GLOBE</button>
        <button className="chip" aria-pressed={mode === "district"} onClick={() => choose("district")}>DISTRICT MAP</button>
        {notice && <span className="mono notice" role="status">{notice}</span>}
      </div>
      {mode === "globe" ? (
        <GlobeBoundary onFail={handleFail}>
          <GlobeView plots={plots} onSelectView={onSelectView} onFail={handleFail} />
        </GlobeBoundary>
      ) : (
        <MapView plots={plots} onSelectView={onSelectView} />
      )}
    </div>
  );
}
