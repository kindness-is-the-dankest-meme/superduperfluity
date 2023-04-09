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

type MinWebSocket = Pick<WebSocket, "readyState" | "OPEN">;
const isOpen = ({ readyState }: MinWebSocket) => readyState === WebSocket.OPEN;
const isReady = (webSocket: any): Promise<void> =>
  new Promise((resolve) =>
    isOpen(webSocket)
      ? resolve()
      : Evt.from<Event>(webSocket, "open").attachOnce(() => resolve())
  );

const webSocket = new WebSocket("ws://localhost:8080");
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

negotiate(webSocket, peerConnection, isReady);
