import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import pkg from "../package.json";

// Log app version from package.json
console.log("App Version: " + pkg.version);

createRoot(document.getElementById("root")!).render(<App />);
