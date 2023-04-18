import { Evt } from "evt";
import type { WebSocketish } from "./types.js";

export const isOpen = (webSocket: WebSocketish): Promise<true> =>
  new Promise<true>((resolve) =>
    webSocket.readyState !== webSocket.OPEN
      ? Evt.from<Event>(webSocket, "open").attachOnce(() => resolve(true))
      : resolve(true)
  );
