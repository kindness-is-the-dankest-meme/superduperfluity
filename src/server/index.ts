import { Evt } from "evt";
import { createServer } from "node:http";
import wrtc from "wrtc";
import { WebSocket, WebSocketServer } from "ws";

import { isOpen } from "../shared/isOpen.js";
import { negotiate } from "../shared/negotiate.js";
import { rtcConfiguration } from "../shared/rtcConfiguration.js";
import { dispatch, type ServerAction } from "../shared/state.js";

const server = createServer();
const socketServer = new WebSocketServer({ server });

const { RTCPeerConnection, RTCSessionDescription } = wrtc;
const createPeerConnection = () => new RTCPeerConnection(rtcConfiguration);

const channels = new Map<string, RTCDataChannel>();

let actionId = 0;
const createServerAction = (
  type: string,
  payload?: any
): ServerAction<any> => ({
  source: "server",
  type,
  payload: {
    ...payload,
    serverNow: Date.now(),
    serverActionId: actionId++,
  },
});

Evt.from<WebSocket>(socketServer, "connection").attach(async (webSocket) => {
  console.log("connection");

  await isOpen(webSocket);
  const peerConnection = createPeerConnection();
  negotiate(webSocket, peerConnection, {
    RTCSessionDescription,
  });

  Evt.from<RTCDataChannelEvent>(peerConnection, "datachannel").attach(
    ({ channel }) => {
      console.log("datachannel", channel.label, channel.readyState);

      const dataChannelCtx = Evt.newCtx();
      channels.set(channel.label, channel);

      Evt.merge([
        Evt.from<Event>(dataChannelCtx, channel, "close"),
        Evt.from<Event>(dataChannelCtx, channel, "error"),
      ]).attachOnce(() => {
        channels.delete(channel.label);
        dataChannelCtx.done();
      });

      Evt.from<MessageEvent>(dataChannelCtx, channel, "message").attach(
        ({ data }) => {
          const { type, payload } = JSON.parse(data);

          const action = createServerAction(type, payload);
          dispatch(action);

          channels.forEach((c) => c.send(JSON.stringify(action)));
        }
      );
    }
  );
});

server.listen(8080);
