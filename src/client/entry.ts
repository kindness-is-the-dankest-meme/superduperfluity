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
const actionChannel = peerConnection.createDataChannel(`action:${clientId}`, {
  ordered: false,
  maxRetransmits: 0,
});
const stateChannel = peerConnection.createDataChannel(
  `state:${clientId}` /* , {
  // these are the default values
  ordered: true,
  maxRetransmits: null,
} */
);

const dataChannelCtx = Evt.newCtx();

Evt.from<Event>(window, "unload").attachOnce(() => {
  actionChannel.close();
  stateChannel.close();
});

Evt.merge(dataChannelCtx, [
  Evt.from<Event>(actionChannel, "error"),
  Evt.from<Event>(actionChannel, "close"),
  Evt.from<Event>(stateChannel, "error"),
  Evt.from<Event>(stateChannel, "close"),
]).attach(({ target, type }) => {
  console.log((target as RTCDataChannel).label, type);
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

Evt.merge(dataChannelCtx, [
  Evt.from<Event>(actionChannel, "open"),
  Evt.from<Event>(stateChannel, "open"),
]).attach(() => {
  if (
    !(actionChannel.readyState === "open" && stateChannel.readyState === "open")
  ) {
    return;
  }

  const action = createClientAction("open");
  actionChannel.send(JSON.stringify(action));
  dispatch(action);

  Evt.merge(dataChannelCtx, [
    Evt.from<MessageEvent>(actionChannel, "message"),
    Evt.from<MessageEvent>(stateChannel, "message"),
  ]).attach(({ data }) => dispatch(JSON.parse(data)));

  Evt.merge([
    Evt.from<PointerEvent>(document, "pointerenter"),
    Evt.from<PointerEvent>(document, "pointerover"),
  ]).attach(({ buttons, pointerId, pointerType, x, y }) => {
    const action = createClientAction("pointerstart", {
      pointerId,
      pointerType,
      isDown:
        (pointerType === "mouse" && buttons !== 0) ||
        pointerType === "touch" ||
        pointerType === "pen",
      x,
      y,
    });
    actionChannel.send(JSON.stringify(action));
    dispatch(action);
  });

  Evt.merge([
    Evt.from<PointerEvent>(document, "pointerleave"),
    Evt.from<PointerEvent>(document, "pointerout"),
  ]).attach(({ pointerId }) => {
    const action = createClientAction("pointerend", {
      pointerId,
    });
    actionChannel.send(JSON.stringify(action));
    dispatch(action);
  });

  Evt.from<PointerEvent>(document, "pointermove").attach(
    ({ buttons, pointerId, pointerType, x, y }) => {
      const action = createClientAction("pointermove", {
        pointerId,
        pointerType,
        isDown:
          (pointerType === "mouse" && buttons !== 0) ||
          pointerType === "touch" ||
          pointerType === "pen",
        x,
        y,
      });
      actionChannel.send(JSON.stringify(action));
      dispatch(action);
    }
  );
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
 *
 * - add a reliable sync channel
 * - send initial state on open
 * - trigger sync on desync
 *   - naive: client request on skipped action ids
 */
