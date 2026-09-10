import { createRoot } from 'react-dom/client';
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { ThemeProvider } from "./contexts/ThemeContext.tsx";
import "./index.css";
import { installChunkRecovery } from "./lib/chunkRecovery";

// Before React renders, so a stale tab recovers instead of crashing.
installChunkRecovery();

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </ErrorBoundary>
);
