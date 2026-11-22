import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./styles/app.css"
import { registerServiceWorker } from "./pwa"
import { loadIcons } from "./ui/icons"
import { App } from "./App"

registerServiceWorker()

const root = document.getElementById("root")
if (!root) throw new Error("Root element missing")

void loadIcons()
  .catch((error: unknown) => console.error("Icon set failed to load", error))
  .then(() =>
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  )
