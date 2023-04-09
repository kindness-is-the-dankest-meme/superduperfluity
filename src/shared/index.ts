import { Evt } from "evt";

interface WebSocketishEventMap {
  message: Pick<MessageEvent, "data" | "type">;
  open: Pick<Event, "type">;
}

export interface WebSocketish extends Pick<WebSocket, "readyState" | "OPEN"> {
  send(data: string): void;
  addEventListener<K extends keyof WebSocketishEventMap>(
    type: K,
    listener: (this: WebSocketish, event: WebSocketishEventMap[K]) => any
  ): void;
  removeEventListener<K extends keyof WebSocketishEventMap>(
    type: K,
    listener: (this: WebSocketish, event: WebSocketishEventMap[K]) => any
  ): void;
}

export const negotiate = async (
  [webSocket, ready]: [WebSocketish, Promise<true>],
  peerConnection: RTCPeerConnection
) => {
  Evt.merge([
    Evt.from<Event>(peerConnection, "connectionstatechange"),
    Evt.from<Event>(peerConnection, "signallingstatechange"),
  ]).attach((event) =>
    console.log(
      event.type,
      peerConnection.signalingState,
      peerConnection.connectionState
    )
  );

  Evt.from<Event>(peerConnection, "negotiationneeded").attach(async () => {
    console.log("negotiationneeded");

    try {
      await Promise.all([peerConnection.setLocalDescription(), ready]);

      webSocket.send(
        JSON.stringify({ description: peerConnection.localDescription })
      );
    } catch (error) {
      console.error(error);
    }
  });

  Evt.from<RTCPeerConnectionIceEvent>(peerConnection, "icecandidate").attach(
    async ({ candidate }) => {
      console.log("icecandidate", { candidate });

      await ready;
      webSocket.send(JSON.stringify({ candidate }));
    }
  );

  // TODO: fix the types
  Evt.from<MessageEvent>(webSocket, "message").attach(async ({ data }) => {
    console.log("message", { data });

    try {
      const { candidate, description } = JSON.parse(data);

      candidate && (await peerConnection.addIceCandidate(candidate));

      description &&
        description.type !== "offer" &&
        (await peerConnection.setRemoteDescription(description));
    } catch (error) {
      console.error(error);
    }
  });
};
