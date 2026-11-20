import { ExwaveProvider } from "@exwave-nexus/auth/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { navigate } from "./router";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root");

createRoot(root).render(
  <StrictMode>
    {/* The browser talks to Exwave Auth; the refresh token stays in localStorage. */}
    <ExwaveProvider
      publishableKey={import.meta.env.VITE_EXWAVE_PUBLISHABLE_KEY}
      navigate={navigate}
    >
      <App />
    </ExwaveProvider>
  </StrictMode>,
);
