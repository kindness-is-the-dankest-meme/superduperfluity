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

Evt.from<WebSocket>(socketServer, "connection").attach((webSocket) => {
  const { readyState, OPEN } = webSocket;
  const ready = new Promise<true>((resolve) =>
    readyState !== OPEN
      ? Evt.from<Event>(webSocket, "open").attachOnce(() => resolve(true))
      : resolve(true)
  );

  console.log("connection", readyState === OPEN ? "open" : "pending");

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

  negotiate([webSocket, ready], peerConnection);
});

server.listen(8080);
