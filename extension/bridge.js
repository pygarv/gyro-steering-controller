// Isolated world (default). Owns the WebSocket to the local relay and
// forwards steering values into the page for inject.js (MAIN world) to read.
(() => {
  const RELAY_URL = "ws://localhost:8765";

  function connect() {
    const ws = new WebSocket(RELAY_URL);

    ws.onopen = () => console.log("[gyro-steering] bridge connected to relay");

    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      console.log("[gyro-steering] bridge received:", msg);
      window.postMessage({ source: "gyro-steering", state: msg }, window.location.origin);
    };

    ws.onclose = () => {
      console.log("[gyro-steering] bridge disconnected, retrying in 2s");
      setTimeout(connect, 2000);
    };

    ws.onerror = () => ws.close();
  }

  connect();
})();
