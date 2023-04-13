import { Evt } from "evt";
import { createServer } from "node:http";
import wrtc from "wrtc";
import { WebSocket, WebSocketServer } from "ws";

import { isOpen } from "../shared/isOpen.js";
import { negotiate } from "../shared/negotiate.js";
import { rtcConfiguration } from "../shared/rtcConfiguration.js";

const server = createServer();
const socketServer = new WebSocketServer({ server });

const { RTCPeerConnection, RTCSessionDescription } = wrtc;
const createPeerConnection = () => new RTCPeerConnection(rtcConfiguration);

const channels = new Map<string, RTCDataChannel>();
Evt.from<WebSocket>(socketServer, "connection").attach(async (webSocket) => {
  console.log("connection");

  await isOpen(webSocket);
  const peerConnection = createPeerConnection();
  negotiate(webSocket, peerConnection, {
    RTCSessionDescription,
  });

  Evt.from<RTCDataChannelEvent>(peerConnection, "datachannel").attach(
    ({ channel }) => {
      console.log("datachannel", channel.label);
      channels.set(channel.label, channel);

      Evt.from<MessageEvent>(channel, "message").attach(({ data }) =>
        channels.forEach((c) => c.label !== channel.label && c.send(data))
      );
    }
  );
});

server.listen(8080);
