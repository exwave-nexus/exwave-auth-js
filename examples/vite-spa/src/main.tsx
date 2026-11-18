import { ExwaveProvider } from "@exwave/auth/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./styles.css";

const publishableKey = import.meta.env.VITE_EXWAVE_PUBLISHABLE_KEY;
const root = createRoot(document.getElementById("root") as HTMLElement);

root.render(
  <StrictMode>
    {publishableKey ? (
      // This is the whole setup: one key, one provider.
      <ExwaveProvider publishableKey={publishableKey}>
        <App />
      </ExwaveProvider>
    ) : (
      <main className="card">
        Set <code>VITE_EXWAVE_PUBLISHABLE_KEY</code> (Nexus → Managed auth).
      </main>
    )}
  </StrictMode>,
);
