import { Evt } from "evt";
import { negotiate, type WebSocketish } from "../shared";

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

const [webSocket, ready] = createWebSocket("ws://localhost:8080");
const peerConnection = createPeerConnection();
const dataChannel = peerConnection.createDataChannel("superduperfluity");

Evt.merge([
  Evt.from<Event>(peerConnection, "connectionstatechange"),
  Evt.from<Event>(peerConnection, "signalingstatechange"),
]).attach((event) =>
  console.log(
    event.type,
    peerConnection.signalingState,
    peerConnection.connectionState
  )
);

negotiate([webSocket, ready], peerConnection);
