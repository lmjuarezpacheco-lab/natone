import OBR from "@owlbear-rodeo/sdk";
import { render } from "preact";
import { App } from "./app";
import { createMockBackend } from "./backend/mock";
import { createObrBackend } from "./backend/obr";
import "./styles.css";

// Outside Owlbear Rodeo the panel runs on sample data, for development.
const backend = OBR.isAvailable ? await createObrBackend() : createMockBackend();
render(<App backend={backend} />, document.getElementById("app")!);
