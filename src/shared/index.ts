import { Evt } from "evt";
import type { WebSocket as ServerWebSocket } from "ws";

type MinWebSocket = WebSocket | ServerWebSocket;

export const negotiate = async (
  webSocket: any,
  peerConnection: RTCPeerConnection,
  isReady: (webSocket: MinWebSocket) => Promise<void>
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
      await Promise.all([
        peerConnection.setLocalDescription(),
        isReady(webSocket),
      ]);

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

      await isReady(webSocket);
      webSocket.send(JSON.stringify({ candidate }));
    }
  );

  // TODO: fix the types
  Evt.from<MessageEvent>(webSocket as any, "message").attach(
    async ({ data }) => {
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
    }
  );
};
