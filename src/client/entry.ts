import { Evt } from "evt";

import { isOpen } from "../shared/isOpen";
import { negotiate } from "../shared/negotiate";
import { rtcConfiguration } from "../shared/rtcConfiguration";
import { store } from "../shared/state";
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

const { hostname, protocol } = location;
const webSocket = createWebSocket(
  `${protocol.replace("http", "ws")}//${hostname}${
    process.env.NODE_ENV === "production" ? "/wrtc" : ":8080"
  }`
);

const peerConnection = createPeerConnection();
negotiate(webSocket, peerConnection, { RTCSessionDescription });

const localId = randomHex();
const dataChannel = peerConnection.createDataChannel(localId, {
  ordered: false,
  maxRetransmits: 0,
});

Evt.merge([
  Evt.from<Event>(dataChannel, "error"),
  Evt.from<Event>(dataChannel, "close"),
]).attach(({ type }) => {
  console.log("dataChannel", type);
  // negotiate again?
});

Evt.from<Event>(dataChannel, "open").attach(() => {
  const pointers = new Map<string, { x: number; y: number }>();
  Evt.from<MessageEvent>(dataChannel, "message").attach(({ data }) => {
    const { id, x, y } = JSON.parse(data);
    pointers.set(id, { x, y });
    console.log({ id, x, y });
  });

  Evt.from<PointerEvent>(window, "pointermove").attach(({ x, y }) => {
    dataChannel.send(JSON.stringify({ id: localId, x, y }));
    pointers.set(localId, { x, y });
  });

  const { requestAnimationFrame: raf } = window;
  const { PI: π } = Math;
  const ππ = π * 2;

  const throwError = (message: string) => {
    throw new Error(message);
  };

  const el = <T extends Element>(selector: string) =>
    document.querySelector<T>(selector) ??
    throwError(`No element found for selector: ${selector}`);

  const canvas = el<HTMLCanvasElement>("canvas");
  const ctx = canvas.getContext("2d") ?? throwError("No canvas context");

  Evt.from<UIEvent>(window, "resize").attach(() => {
    const { innerWidth, innerHeight } = window;
    canvas.width = innerWidth;
    canvas.height = innerHeight;
  });
  window.dispatchEvent(new UIEvent("resize"));

  const draw = () => {
    raf(draw);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pointers.forEach(({ x, y }, id) => {
      ctx.beginPath();
      ctx.ellipse(x, y, 10, 10, 0, 0, ππ);
      ctx.fillStyle = `#${id}`;
      ctx.fill();
    });
  };

  raf(draw);
});

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
 */
