import { Evt } from "evt";
import type { WebSocketish } from "./types.js";

const isServer = "process" in globalThis;
const isDebug = false;

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
  ]).attach(
    (event) =>
      isDebug &&
      console.log(
        event.type,
        peerConnection.signalingState,
        peerConnection.connectionState
      )
  );

  /**
   * 3. this always starts on the client, and the server accepts all offers
   */
  Evt.from<Event>(peerConnection, "negotiationneeded").attach(async () => {
    isDebug && console.log("negotiationneeded");

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

  /**
   * 4. ice candidates still feel a little like magic to me, but the peer
   *    connection talks to the STUN server to get these and we just need to
   *    forward them to the other peer via the signaling channel (web socket)
   */
  Evt.from<RTCPeerConnectionIceEvent>(peerConnection, "icecandidate").attach(
    async ({ candidate }) => {
      isDebug && console.log("icecandidate", { candidate });
      if (candidate === null) return;

      webSocket.send(JSON.stringify({ candidate }));
    }
  );

  Evt.from<RTCPeerConnectionIceEvent>(
    peerConnection,
    "iceconnectionstatechange"
  ).attach(() => {
    isDebug &&
      console.log(
        "iceconnectionstatechange",
        peerConnection.iceConnectionState
      );

    if (peerConnection.iceConnectionState === "failed") {
      peerConnection.restartIce();
    }
  });

  /**
   * 5. the signalling channel handles candidates and descriptions (offers and
   *    answers) for both client and server
   */
  Evt.from<MessageEvent>(webSocket, "message").attach(
    async ({ type, data }) => {
      isDebug &&
        console.log(
          type,
          peerConnection.signalingState,
          peerConnection.connectionState
        );

      try {
        const { candidate, description } = JSON.parse(data);
        isDebug && console.log({ candidate, description });

        if (candidate) {
          await peerConnection.addIceCandidate(candidate);
        }

        if (description) {
          await peerConnection.setRemoteDescription(description);

          if (description.type === "offer") {
            if (
              !isServer &&
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
