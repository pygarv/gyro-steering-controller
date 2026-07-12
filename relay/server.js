// ponytail: dumbest possible relay — one room, last-value broadcast, no auth.
// Fine for a single phone + single Mac on the same LAN. Add pairing/auth if
// this ever leaves your home network.
import { WebSocketServer } from "ws";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 8765;

const httpServer = createServer(async (req, res) => {
  if (req.url === "/" || req.url === "/phone.html") {
    const html = await readFile(join(__dirname, "public/phone.html"));
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws, req) => {
  console.log(`[relay] client connected from ${req.socket.remoteAddress} (${wss.clients.size} total)`);

  ws.on("message", (data) => {
    console.log(`[relay] received from ${req.socket.remoteAddress}:`, data.toString());
    // broadcast raw control state to every other connected client (extension bridge, etc.)
    for (const client of wss.clients) {
      if (client !== ws && client.readyState === client.OPEN) {
        client.send(data.toString());
      }
    }
  });

  ws.on("close", () => console.log("[relay] client disconnected"));
});

httpServer.listen(PORT, () => {
  console.log(`[relay] http+ws listening on port ${PORT}`);
  console.log(`[relay] on your phone, visit http://<this-mac-lan-ip>:${PORT}/`);
});
