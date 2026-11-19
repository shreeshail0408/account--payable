import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource-variable/inter";
import App from "./App";
import { ThemeProvider } from "./components/theme-provider";
import { Toaster } from "./components/ui/toast";
import { TooltipProvider } from "./components/ui/tooltip";
import "./styles/theme.css";
// Legacy stylesheets: delete once every page is migrated to src/components/ui.
import "./styles.css";
import "./line-items.css";
import "./notifications.css";
// Must load after the legacy files: it overrides a few of their rules.
import "./styles/legacy-bridge.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider>
      <TooltipProvider delayDuration={300}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  </React.StrictMode>
);
