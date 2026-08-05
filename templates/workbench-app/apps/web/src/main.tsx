import { createRoot } from "react-dom/client";
import { createWebApp } from "@atrium/web-host";
import { defaultTheme } from "@atrium/theme";
import { notesWebModule } from "@atrium/notes/web";
import { applicationConfig } from "../../config/application.js";
import "./index.css";

// TODO: 与 config/application.ts 保持一致;增加新模块时在此追加 Web 入口。
const App = createWebApp({
  config: applicationConfig,
  modules: [notesWebModule],
  themePacks: [defaultTheme],
});

const root = document.getElementById("root");
if (root === null) {
  throw new Error("missing #root");
}
createRoot(root).render(<App />);
