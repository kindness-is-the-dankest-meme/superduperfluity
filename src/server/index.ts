import { Evt } from "evt";
import { createServer } from "node:http";
import wrtc from "wrtc";
import { WebSocket, WebSocketServer } from "ws";

import { negotiate } from "../shared/index.js";

const server = createServer();

const socketServer = new WebSocketServer({ server });

const { RTCPeerConnection } = wrtc;
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

Evt.from<WebSocket>(socketServer, "connection").attach((webSocket) => {
  console.log("connection");
  const peerConnection = createPeerConnection();

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
});

server.listen(8080);
