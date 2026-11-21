import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import Landing from "./Landing";
import "leaflet/dist/leaflet.css";
import "./styles.css";

function Root() {
  const [started, setStarted] = useState(false);
  if (!started) return <Landing onStart={() => setStarted(true)} />;
  return <App onHome={() => setStarted(false)} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
