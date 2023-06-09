import { current } from "immer";
import { redux } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { createStore } from "zustand/vanilla";

type ClientActionPayload = {
  clientId: string;
  clientNow: number;
  clientActionId: number;
};

export type ClientAction<P extends any> = {
  source: "client";
  type: string;
  payload: P & ClientActionPayload;
};

type ServerActionPayload = {
  serverNow: number;
  serverActionId: number;
};

export type ServerAction<P extends any> = {
  source: "server";
  type: string;
  payload: P & ClientActionPayload & ServerActionPayload;
};

type Action<P extends any = any> = ClientAction<P> | ServerAction<P>;

type ImmerReducer<S extends any = any, A extends Action = Action> = (
  state: S,
  action: A
) => void;

type ReducerDecorator<S extends any = any, A extends Action = Action> = (
  reducer: ImmerReducer<S, A>
) => ImmerReducer<S, A>;

const reducer: ImmerReducer = (state, { type, payload }) => {
  const { clientId } = payload;

  switch (type) {
    case "open": {
      state.clients[clientId] = {
        pointers: {},
      };
      break;
    }

    case "close":
    case "error": {
      delete state.clients[clientId];
      break;
    }

    case "pointerstart": {
      const { pointerId, pointerType, isDown, x, y } = payload;

      state.clients[clientId].pointers ||
        (state.clients[clientId].pointers = {});

      state.clients[clientId].pointers[pointerId] = {
        pointerId,
        pointerType,
        isDown,
        x,
        y,
      };
      break;
    }

    case "pointerend": {
      const { pointerId } = payload;
      delete state.clients[clientId].pointers[pointerId];
      break;
    }

    case "pointermove": {
      const { pointerId, pointerType, isDown, x, y } = payload;

      state.clients[clientId].pointers ||
        (state.clients[clientId].pointers = {});

      state.clients[clientId].pointers[pointerId] = {
        pointerId,
        pointerType,
        isDown,
        x,
        y,
      };
      break;
    }

    default:
      return;
  }
};

const isEqual = (a: Action<any>, b: Action<any>) =>
  a.type === b.type && a.payload.clientActionId === b.payload.clientActionId;

const withRollback: ReducerDecorator = <S extends any, A extends Action>(
  reducer: ImmerReducer<S, A>
) => {
  let settledState: any = initialState;
  const settledActions: ServerAction<any>[] = [];
  const pendingActions: ClientAction<any>[] = [];

  return (state, action) => {
    if (action.source === "client") {
      pendingActions.push(action);
      reducer(state, action as any);
    }

    if (action.source === "server") {
      if (action.type === "sync") {
        Object.assign(state, action.payload);
      } else {
        // not 100% sure we actually need to keep these around, but it might be
        // useful for debugging
        settledActions.push(action);

        // overwrite state with the settled state and apply the action
        reducer(Object.assign(state, settledState), action as any);

        // check if the action represensts a resolution of a pending action
        const settlingAction = pendingActions.find((pendingAction) =>
          isEqual(action, pendingAction)
        );

        if (settlingAction) {
          // we found a match, the action is now settled, remove it from pending
          pendingActions.splice(pendingActions.indexOf(settlingAction), 1);
        } else {
          // does the server action invalidate any of our pending actions?
        }
      }

      // stash the settled state, we're about to reapply pending actions
      settledState = current(state);

      // reapply pending actions
      pendingActions.forEach((pendingAction) =>
        reducer(state, pendingAction as any)
      );
    }
  };
};

const initialState = {
  clients: {},
};

export const { dispatch, getState, subscribe } = createStore(
  immer(redux(withRollback(reducer), initialState))
);
