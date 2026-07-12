// Runs in the page's MAIN world so it can override the getGamepads() the
// game itself calls. Phone control state arrives via window.postMessage from
// bridge.js (isolated world), which owns the actual WebSocket connection —
// MAIN-world scripts can't safely share extension messaging APIs.
//
// Two phone modes, distinguished by state.mode from the phone page:
//   "assist" — merges into whatever real controller is at index 0 (today's
//              single-player steering-assist behavior, unchanged).
//   "player" — becomes its own fully synthetic Gamepad at state.slot, with
//              no real hardware backing. For local co-op via better-xcloud's
//              Local Co-Op toggle, which keys its internal state by gamepad
//              index — so any distinct index we emit here becomes a distinct
//              player automatically once that toggle is on. We don't
//              reimplement co-op logic ourselves, just occupy extra slots.
(() => {
  const realGetGamepads = navigator.getGamepads.bind(navigator);

  // Standard Gamepad mapping button indices.
  const BTN_A = 0; // handbrake
  const BTN_B = 1;
  const BTN_X = 2;
  const BTN_Y = 3;
  const BTN_LB = 4; // shift down
  const BTN_RB = 5; // shift up
  const BTN_LT = 6; // brake
  const BTN_RT = 7; // throttle
  const BTN_VIEW = 8; // select/back
  const BTN_MENU = 9; // start
  const BTN_DPAD_UP = 12;
  const BTN_DPAD_DOWN = 13;
  const BTN_DPAD_LEFT = 14;
  const BTN_DPAD_RIGHT = 15;
  const NUM_BUTTONS = 17;
  const VIRTUAL_ID = "GyroSteering Virtual Controller";

  // clientId -> latest state from that phone
  const players = new Map();
  const connectedSlots = new Set();

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.origin !== window.location.origin) return;
    if (event.data?.source !== "gyro-steering") return;
    const incoming = event.data.state;
    players.set(incoming.clientId, incoming);
  });

  window.__gyroPlayers = players; // debug: inspect live per-phone state in console
  window.__realGamepads = realGetGamepads; // debug: check real controller's actual index/mapping

  function assistState() {
    for (const p of players.values()) {
      if (p.mode !== "player") return p; // "assist" (or legacy, mode-less) phones
    }
    return null;
  }

  // Real controller and phone both feed the same button — OR them together
  // so either source can press it (phone idle must never mask a real press).
  function merged(real, phoneValue) {
    const value = Math.max(real ? real.value : 0, phoneValue);
    const pressed = value > 0;
    return { pressed, touched: pressed, value };
  }

  function buildButtonsFromState(realButtons, s) {
    const out = realButtons
      ? Array.from(realButtons).map((b) => ({ pressed: b.pressed, touched: b.touched, value: b.value }))
      : Array.from({ length: NUM_BUTTONS }, () => ({ pressed: false, touched: false, value: 0 }));

    out[BTN_RT] = merged(out[BTN_RT], s.throttle || 0);
    out[BTN_LT] = merged(out[BTN_LT], s.brake || 0);
    out[BTN_A] = merged(out[BTN_A], s.a ? 1 : 0);
    out[BTN_B] = merged(out[BTN_B], s.b ? 1 : 0);
    out[BTN_X] = merged(out[BTN_X], s.x ? 1 : 0);
    out[BTN_Y] = merged(out[BTN_Y], s.y ? 1 : 0);
    out[BTN_LB] = merged(out[BTN_LB], s.lb ? 1 : 0);
    out[BTN_RB] = merged(out[BTN_RB], s.rb ? 1 : 0);
    out[BTN_VIEW] = merged(out[BTN_VIEW], s.view ? 1 : 0);
    out[BTN_MENU] = merged(out[BTN_MENU], s.start ? 1 : 0);
    out[BTN_DPAD_UP] = merged(out[BTN_DPAD_UP], s.dpadUp ? 1 : 0);
    out[BTN_DPAD_DOWN] = merged(out[BTN_DPAD_DOWN], s.dpadDown ? 1 : 0);
    out[BTN_DPAD_LEFT] = merged(out[BTN_DPAD_LEFT], s.dpadLeft ? 1 : 0);
    out[BTN_DPAD_RIGHT] = merged(out[BTN_DPAD_RIGHT], s.dpadRight ? 1 : 0);

    return out;
  }

  function fireGamepadEvent(type, gamepad) {
    const event = new Event(type);
    event.gamepad = gamepad; // GamepadEvent's real constructor rejects plain objects; bolt it on instead
    window.dispatchEvent(event);
  }

  // Whichever input is pushed further from center wins, so the real stick
  // still works when the phone is resting flat (and vice versa).
  function mergedAxis(real, phoneValue) {
    return Math.abs(phoneValue) > Math.abs(real) ? phoneValue : real;
  }

  function buildRealGamepadEntry(gp, isAssistTarget, assist) {
    const axes = Array.from(gp.axes);
    if (isAssistTarget) {
      axes[0] = mergedAxis(axes[0], assist.steering || 0);
      axes[1] = mergedAxis(axes[1], assist.steeringY || 0);
    }
    return {
      id: gp.id,
      index: gp.index,
      connected: gp.connected,
      mapping: gp.mapping,
      timestamp: performance.now(),
      axes,
      buttons: isAssistTarget ? buildButtonsFromState(gp.buttons, assist) : Array.from(gp.buttons),
      vibrationActuator: gp.vibrationActuator,
    };
  }

  function makeVirtualGamepad(slot, s) {
    return {
      id: VIRTUAL_ID,
      index: slot,
      connected: true,
      mapping: "standard",
      timestamp: performance.now(),
      axes: [s.steering || 0, s.steeringY || 0, 0, 0],
      buttons: buildButtonsFromState(null, s),
      vibrationActuator: null,
    };
  }

  navigator.getGamepads = function patchedGetGamepads() {
    const real = realGetGamepads();
    const usedIndices = new Set();
    const out = [];

    const assist = assistState();
    // Apply assist merge to whichever real controller connected first — its
    // index is assigned by the OS/browser and is NOT reliably 0.
    const assistTargetIndex = assist ? Array.from(real).find(Boolean)?.index : undefined;

    for (const gp of real) {
      if (!gp) {
        out.push(gp);
        continue;
      }
      usedIndices.add(gp.index);
      const isAssistTarget = gp.index === assistTargetIndex;
      out.push(buildRealGamepadEntry(gp, isAssistTarget, assist));
    }

    for (const s of players.values()) {
      if (s.mode !== "player") continue;
      const slot = Number(s.slot);
      if (!Number.isInteger(slot) || usedIndices.has(slot)) continue;
      usedIndices.add(slot);
      out[slot] = makeVirtualGamepad(slot, s);

      if (!connectedSlots.has(slot)) {
        connectedSlots.add(slot);
        fireGamepadEvent("gamepadconnected", out[slot]);
        console.log(`[gyro-steering] virtual player connected at slot ${slot}`);
      }
    }

    return out;
  };

  console.log("[gyro-steering] getGamepads() patched — assist + multi-player modes active");
})();
