import { Evt } from "evt";

import { isOpen } from "../shared/isOpen";
import { negotiate } from "../shared/negotiate";
import { rtcConfiguration } from "../shared/rtcConfiguration";
import { dispatch, subscribe, type ClientAction } from "../shared/state";
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

const clientId = randomHex();
const dataChannel = peerConnection.createDataChannel(clientId, {
  ordered: false,
  maxRetransmits: 0,
});

const dataChannelCtx = Evt.newCtx();

Evt.merge([
  Evt.from<Event>(dataChannel, "error"),
  Evt.from<Event>(dataChannel, "close"),
]).attach(({ type }) => {
  console.log("dataChannel", type);
  dataChannelCtx.done();
  // negotiate again?
});

let actionId = 0;
const createClientAction = (
  type: string,
  payload?: any
): ClientAction<any> => ({
  source: "client",
  type,
  payload: {
    ...payload,
    clientNow: Date.now(),
    clientActionId: actionId++,
    clientId,
  },
});

const throwError = (message: string) => {
  throw new Error(message);
};

const el = <T extends Element>(selectors: string) =>
  document.querySelector<T>(selectors) ??
  throwError(`No element found for ${selectors}`);

const canvas = el<HTMLCanvasElement>("canvas");
const context = canvas.getContext("2d") ?? throwError("No context");

subscribe(({ clients }) => {
  console.log(JSON.stringify(clients, null, 2));
});

Evt.from<Event>(dataChannelCtx, dataChannel, "open").attach(() => {
  const action = createClientAction("dataChannel:open");
  dataChannel.send(JSON.stringify(action));
  dispatch(action);

  Evt.from<MessageEvent>(dataChannelCtx, dataChannel, "message").attach(
    ({ data }) => dispatch(JSON.parse(data))
  );

  // Evt.merge([
  //   Evt.from<PointerEvent>(document, "pointerenter"),
  //   Evt.from<PointerEvent>(document, "pointerover"),
  // ]).attach(({ pointerId, pointerType, x, y }) => {
  //   const action = createClientAction("pointerenterover", {
  //     pointerId,
  //     pointerType,
  //     x,
  //     y,
  //   });
  //   dataChannel.send(JSON.stringify(action));
  //   dispatch(action);
  // });
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
