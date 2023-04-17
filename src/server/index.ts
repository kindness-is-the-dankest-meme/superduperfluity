import { Evt } from "evt";
import { createServer } from "node:http";
import wrtc from "wrtc";
import { WebSocket, WebSocketServer } from "ws";

import { isOpen } from "../shared/isOpen.js";
import { negotiate } from "../shared/negotiate.js";
import { rtcConfiguration } from "../shared/rtcConfiguration.js";
import { dispatch, getState, type ServerAction } from "../shared/state.js";

const server = createServer();
const socketServer = new WebSocketServer({ server });

const { RTCPeerConnection, RTCSessionDescription } = wrtc;
const createPeerConnection = () => new RTCPeerConnection(rtcConfiguration);

const actionChannels = new Map<string, RTCDataChannel>();
const stateChannels = new Map<string, RTCDataChannel>();

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
    ({ type, channel }) => {
      console.log(type, channel.label, channel.readyState);

      const dataChannelCtx = Evt.newCtx();

      if (channel.label.startsWith("action:")) {
        actionChannels.set(channel.label, channel);

        Evt.merge(dataChannelCtx, [
          Evt.from<Event>(channel, "close"),
          Evt.from<Event>(channel, "error"),
        ]).attachOnce(({ type }) => {
          actionChannels.delete(channel.label);

          const action = createServerAction(type, {
            clientId: channel.label.replace("action:", ""),
          });
          dispatch(action);

          actionChannels.forEach((c) => c.send(JSON.stringify(action)));

          stateChannels
            .get(channel.label.replace("action:", "state:"))
            ?.close();

          dataChannelCtx.done();
        });

        Evt.from<MessageEvent>(dataChannelCtx, channel, "message").attach(
          ({ data }) => {
            const { type, payload } = JSON.parse(data);

            const action = createServerAction(type, payload);
            dispatch(action);

            actionChannels.forEach((c) => c.send(JSON.stringify(action)));
          }
        );
      }

      if (channel.label.startsWith("state:")) {
        channel.send(JSON.stringify(createServerAction("sync", getState())));

        Evt.merge(dataChannelCtx, [
          Evt.from<Event>(channel, "close"),
          Evt.from<Event>(channel, "error"),
        ]).attachOnce(() => {
          stateChannels.delete(channel.label);

          actionChannels
            .get(channel.label.replace("state:", "action:"))
            ?.close();

          dataChannelCtx.done();
        });

        Evt.from<MessageEvent>(dataChannelCtx, channel, "message").attach(() =>
          channel.send(JSON.stringify(createServerAction("sync", getState())))
        );
      }
    }
  );
});

server.listen(8080);
