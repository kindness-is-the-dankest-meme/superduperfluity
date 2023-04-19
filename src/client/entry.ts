import { Evt } from "evt";

import { isOpen } from "../shared/isOpen";
import { negotiate } from "../shared/negotiate";
import { rtcConfiguration } from "../shared/rtcConfiguration";
import {
  dispatch,
  subscribe,
  type ClientAction,
  getState,
} from "../shared/state";
import { randomHex } from "./randomHex";

const createPeerConnection = () => new RTCPeerConnection(rtcConfiguration);

class SignalingSocket extends WebSocket {
  async send(data: Parameters<WebSocket["send"]>["0"]) {
    await isOpen(this);
    super.send(data);
  }
}

const createWebSocket = (...args: ConstructorParameters<typeof WebSocket>) =>
  new SignalingSocket(...args);

/**
 * 1. create the web socket (as signaling channel) and peer connection,
 *    negotiate wires up the necessary event listeners to handle negotiation
 */
const { hostname, protocol } = location;
const webSocket = createWebSocket(
  `${protocol.replace("http", "ws")}//${hostname}${
    process.env.NODE_ENV === "production" ? "/wrtc" : ":8080"
  }`
);

const peerConnection = createPeerConnection();
negotiate(webSocket, peerConnection, { RTCSessionDescription });

/**
 * 2. creating the data channels kicks off the 'negotiationneeded' event, only
 *    the client ever calls/makes connection offers
 */
const clientId = randomHex();
const actionChannel = peerConnection.createDataChannel(`action:${clientId}`, {
  ordered: false,
  maxRetransmits: 0,
});
const stateChannel = peerConnection.createDataChannel(
  `state:${clientId}` /* , {
  // these are the default values
  ordered: true,
  maxRetransmits: null,
} */
);

const dataChannelCtx = Evt.newCtx();

Evt.from<Event>(window, "unload").attachOnce(() => {
  actionChannel.close();
  stateChannel.close();
});

Evt.merge(dataChannelCtx, [
  Evt.from<Event>(actionChannel, "error"),
  Evt.from<Event>(actionChannel, "close"),
  Evt.from<Event>(stateChannel, "error"),
  Evt.from<Event>(stateChannel, "close"),
]).attach(({ target, type }) => {
  console.log((target as RTCDataChannel).label, type);
  dataChannelCtx.done();
  // negotiate again?
});

let actionId = 0;
const createClientAction = (
  type: string,
  payload?: any
): ClientAction<any> => ({
  source: "client",
  type,
  payload: {
    ...payload,
    clientNow: Date.now(),
    clientActionId: actionId++,
    clientId,
  },
});

/**
 * 7. client actions are immediately dispatched to the store, and sent to the
 *    server (via the unordered, unreliable data channel)
 */
const sendClientAction = (type: string, payload?: any): void => {
  const action = createClientAction(type, payload);
  actionChannel.send(JSON.stringify(action));
  dispatch(action);
};

Evt.merge(dataChannelCtx, [
  Evt.from<Event>(actionChannel, "open"),
  Evt.from<Event>(stateChannel, "open"),
]).attach(() => {
  if (
    !(actionChannel.readyState === "open" && stateChannel.readyState === "open")
  ) {
    return;
  }

  /**
   * 6. negotiation is complete, our data channels are open and we can start the
   *    state synchronization
   */
  sendClientAction("open");

  /**
   * 8. messages from the server (either actions or state/sync) are dispatched
   *    to the local store
   */
  Evt.merge(dataChannelCtx, [
    Evt.from<MessageEvent>(actionChannel, "message"),
    Evt.from<MessageEvent>(stateChannel, "message"),
  ]).attach(({ data }) => dispatch(JSON.parse(data)));

  Evt.merge([
    Evt.from<PointerEvent>(document, "pointerenter"),
    Evt.from<PointerEvent>(document, "pointerover"),
    Evt.from<PointerEvent>(document, "pointerdown"),
  ]).attach(({ buttons, pointerId, pointerType, x, y }) =>
    sendClientAction("pointerstart", {
      pointerId,
      pointerType,
      isDown:
        (pointerType === "mouse" && buttons !== 0) ||
        pointerType === "touch" ||
        pointerType === "pen",
      x: x - canvas.width / 2,
      y: y - canvas.height / 2,
    })
  );

  Evt.merge([
    Evt.from<PointerEvent>(document, "pointerleave"),
    Evt.from<PointerEvent>(document, "pointerout"),
    Evt.from<PointerEvent>(document, "pointerup"),
  ]).attach(({ type, buttons, pointerId, pointerType, x, y }) =>
    type === "pointerup" && pointerType === "mouse"
      ? sendClientAction("pointermove", {
          pointerId,
          pointerType,
          isDown: buttons !== 0,
          x: x - canvas.width / 2,
          y: y - canvas.height / 2,
        })
      : sendClientAction("pointerend", {
          pointerId,
        })
  );

  Evt.from<PointerEvent>(document, "pointermove").attach(
    ({ buttons, pointerId, pointerType, x, y }) =>
      sendClientAction("pointermove", {
        pointerId,
        pointerType,
        isDown:
          (pointerType === "mouse" && buttons !== 0) ||
          pointerType === "touch" ||
          pointerType === "pen",
        x: x - canvas.width / 2,
        y: y - canvas.height / 2,
      })
  );
});

subscribe(({ clients }) => {
  console.log(JSON.stringify(clients, null, 2));
});

const throwError = (message: string) => {
  throw new Error(message);
};

const el = <T extends Element>(selectors: string) =>
  document.querySelector<T>(selectors) ??
  throwError(`No element found for ${selectors}`);

const canvas = el<HTMLCanvasElement>("canvas");
const context = canvas.getContext("2d") ?? throwError("No context");

Evt.from<UIEvent>(window, "resize").attach(() => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
});
window.dispatchEvent(new UIEvent("resize"));

const draw = () => {
  requestAnimationFrame(draw);

  context.clearRect(0, 0, canvas.width, canvas.height);

  const { clients } = getState();
  Object.entries<{ pointers: any }>(clients).forEach(
    ([clientId, { pointers }]) =>
      Object.values<{
        pointerType: "mouse" | "pen" | "touch";
        isDown: boolean;
        x: number;
        y: number;
      }>(pointers).forEach(({ pointerType, isDown, x, y }) => {
        context.save();
        context.translate(canvas.width / 2 + x, canvas.height / 2 + y);
        context.rotate(Math.PI / 3);

        context.fillStyle = `#${clientId}`;

        if (pointerType === "touch") {
          context.beginPath();
          context.ellipse(0, 0, 16, 16, 0, 0, Math.PI * 2);
          context.fill();
        } else {
          context.font = `${isDown ? 48 : 32}px monospace`;
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillText(String.fromCharCode(0x2b05, 0xfe0e), 0, 0);
        }

        context.restore();
      })
  );
};
draw();

/**
 * - send input to data channel
 * - send input to state (predictions)
 * - input *from* data channel is "known good"
 *   - current state is last known good state + known good input + predictions
 *   - known good input that *is* a predicion drops the prediction
 *   - invalid predictions are dropped during replay
 *
 * input messages have:
 *   - timestamp
 *   - input id
 *   - client id
 *
 * - add a reliable sync channel
 * - send initial state on open
 * - trigger sync on desync
 *   - naive: client request on skipped action ids
 */
