import { Evt } from "evt";

import { negotiate } from "../shared/negotiate";
import { randomHex } from "../shared/randomHex";

const createPeerConnection = () =>
  new RTCPeerConnection({
    iceServers: [
      {
        urls: [
          "stun:stun.l.google.com:19302",
          "stun:global.stun.twilio.com:3478",
        ],
      },
    ],
  });

const createWebSocket = (
  ...args: ConstructorParameters<typeof WebSocket>
): [WebSocket, Promise<true>] => {
  const webSocket = new WebSocket(...args);
  const { readyState, OPEN } = webSocket;
  return [
    webSocket,
    new Promise<true>((resolve) =>
      readyState !== OPEN
        ? Evt.from<Event>(webSocket, "open").attachOnce(() => resolve(true))
        : resolve(true)
    ),
  ];
};

const { hostname, protocol } = location;
const [webSocket, ready] = createWebSocket(
  `${protocol.replace("http", "ws")}//${hostname}${
    process.env.NODE_ENV === "production" ? "/wrtc" : ":8080"
  }`
);
const peerConnection = createPeerConnection();
negotiate([webSocket, ready], peerConnection, { RTCSessionDescription });

const localId = randomHex();
const dataChannel = peerConnection.createDataChannel(localId, {
  ordered: false,
  maxRetransmits: 0,
});

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
