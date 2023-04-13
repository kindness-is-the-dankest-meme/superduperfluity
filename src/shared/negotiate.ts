import { Evt } from "evt";
import type { WebSocketish } from "./types.js";

const isPolite = "process" in globalThis;

export const negotiate = async (
  webSocket: WebSocketish,
  peerConnection: RTCPeerConnection,
  {
    RTCSessionDescription,
  }: {
    RTCSessionDescription: typeof globalThis.RTCSessionDescription;
  }
) => {
  let isOffering = false;

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
      isOffering = true;

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(
        new RTCSessionDescription(offer)
      );

      webSocket.send(
        JSON.stringify({ description: peerConnection.localDescription })
      );
    } catch (error) {
      console.error(error);
    } finally {
      isOffering = false;
    }
  });

  Evt.from<RTCPeerConnectionIceEvent>(peerConnection, "icecandidate").attach(
    async ({ candidate }) => {
      console.log("icecandidate", { candidate });
      if (candidate === null) return;

      webSocket.send(JSON.stringify({ candidate }));
    }
  );

  Evt.from<RTCPeerConnectionIceEvent>(
    peerConnection,
    "iceconnectionstatechange"
  ).attach(() => {
    console.log("iceconnectionstatechange", peerConnection.iceConnectionState);
    if (peerConnection.iceConnectionState === "failed") {
      peerConnection.restartIce();
    }
  });

  Evt.from<MessageEvent>(webSocket, "message").attach(
    async ({ type, data }) => {
      console.log(
        type,
        peerConnection.signalingState,
        peerConnection.connectionState
      );

      try {
        const { candidate, description } = JSON.parse(data);
        console.log({ candidate, description });

        if (candidate) {
          await peerConnection.addIceCandidate(candidate);
        }

        if (description) {
          await peerConnection.setRemoteDescription(description);

          if (description.type === "offer") {
            if (
              !isPolite &&
              (isOffering || peerConnection.signalingState !== "stable")
            ) {
              return;
            }

            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(
              new RTCSessionDescription(answer)
            );

            webSocket.send(
              JSON.stringify({ description: peerConnection.localDescription })
            );
          }
        }
      } catch (error) {
        console.error(error);
      }
    }
  );
};
