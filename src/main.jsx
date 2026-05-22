import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import DispatchLiveUpdatesPage from "./DispatchLiveUpdatesPage.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <DispatchLiveUpdatesPage />
  </React.StrictMode>
);
