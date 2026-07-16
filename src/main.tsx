import { createRoot } from 'react-dom/client';
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { ThemeProvider } from "./contexts/ThemeContext.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </ErrorBoundary>
);
