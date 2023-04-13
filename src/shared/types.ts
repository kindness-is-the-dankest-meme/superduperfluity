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
