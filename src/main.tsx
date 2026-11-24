import OBR from "@owlbear-rodeo/sdk";
import { render } from "preact";
import { App } from "./app";
import { createMockBackend } from "./backend/mock";
import { createObrBackend } from "./backend/obr";
// Roboto, like Owlbear Rodeo itself, served from the extension and not from a font server.
import "@fontsource/roboto/latin-400.css";
import "@fontsource/roboto/latin-500.css";
import "@fontsource/roboto/latin-700.css";
import "@fontsource/roboto/latin-ext-400.css";
import "@fontsource/roboto/latin-ext-500.css";
import "@fontsource/roboto/latin-ext-700.css";
import "./styles.css";

// Outside Owlbear Rodeo the panel runs on sample data, for development.
const backend = OBR.isAvailable ? await createObrBackend() : createMockBackend();
render(<App backend={backend} />, document.getElementById("app")!);
