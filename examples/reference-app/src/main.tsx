/**
 * reference-app Web 入口:组合 web-host 外壳 + notes Web 模块 + 默认主题。
 */
import { createRoot } from "react-dom/client";
import { createWebApp } from "@atrium/web-host";
import { defaultTheme } from "@atrium/theme";
import { notesWebModule } from "@atrium/notes/web";
import { applicationConfig } from "../config/application.js";
import "./index.css";

const App = createWebApp({
  config: applicationConfig,
  modules: [notesWebModule],
  themePacks: [defaultTheme],
});

const root = document.getElementById("root");
if (!root) {
  throw new Error("missing #root element");
}
createRoot(root).render(<App />);
