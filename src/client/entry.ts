import { Evt } from "evt";

import { negotiate } from "../shared";

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
  `${protocol.replace("http", "ws")}//${hostname}:8080`
);
const peerConnection = createPeerConnection();
negotiate([webSocket, ready], peerConnection, { RTCSessionDescription });

const dataChannel = peerConnection.createDataChannel("superduperfluity", {
  ordered: false,
  maxRetransmits: 0,
});

Evt.from<MessageEvent>(dataChannel, "message").attach(({ data }) =>
  console.log(JSON.parse(data))
);

Evt.from<PointerEvent>(window, "pointermove").attach(({ x, y }) =>
  dataChannel.send(JSON.stringify({ x, y }))
);
