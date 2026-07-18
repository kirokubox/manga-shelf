import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then((registration) => {
      const promote = () => registration.waiting?.postMessage({ type: "SKIP_WAITING" });
      promote();
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => worker.state === "installed" && navigator.serviceWorker.controller && promote());
      });
      document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && registration.update().catch(() => {}));
    }).catch((error) => console.warn("Service Worker registration failed:", error));
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  });
}
