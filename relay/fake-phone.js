// ponytail: stand-in for the real Android page (step 3). Sends a slow sine
// wave over the same protocol a real phone will use, so step 2 (relay +
// extension bridge) can be validated end-to-end before writing any phone code.
import { WebSocket } from "ws";

const ws = new WebSocket("ws://localhost:8765");

ws.on("open", () => {
  console.log("[fake-phone] connected, streaming steering values");
  setInterval(() => {
    const steering = Math.sin(Date.now() / 800);
    ws.send(JSON.stringify({ steering }));
  }, 16); // ~60Hz
});

ws.on("error", (err) => console.error("[fake-phone] error:", err.message));
