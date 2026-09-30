import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}

const collegeTheme = document.documentElement.dataset.theme;
if (collegeTheme) {
  const theme = JSON.parse(collegeTheme) as { primary: string; background: string; foreground: string };
  document.documentElement.style.setProperty("--primary", theme.primary);
  document.documentElement.style.setProperty("--background", theme.background);
  document.documentElement.style.setProperty("--foreground", theme.foreground);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode><App /></StrictMode>,
);
