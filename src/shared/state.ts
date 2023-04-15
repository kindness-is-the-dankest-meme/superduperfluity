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

type Reducer<S extends any = any, A extends Action = Action> = (
  state: S,
  action: A
) => S;

type ReducerDecorator<S extends any = any, A extends Action = Action> = (
  reducer: Reducer<S, A>
) => Reducer<S, A>;

const reducer: Reducer = (state, action) => {
  switch (action.type) {
    case "dataChannel:open":
      // state.clients[action.payload.clientId] = {};
      // return state;
      return {
        ...state,
        clients: {
          ...state.clients,
          [action.payload.clientId]: {},
        },
      };

    default:
      return state;
  }
};

const isEqual = (a: Action<any>, b: Action<any>) =>
  a.type === b.type && a.payload.clientActionId === b.payload.clientActionId;

const withRollback: ReducerDecorator = <S extends any, A extends Action>(
  reducer: Reducer<S, A>
) => {
  let settledState: any = initialState;
  const settledActions: ServerAction<any>[] = [];
  const pendingActions: ClientAction<any>[] = [];

  return (state, action) => {
    if (action.source === "client") {
      pendingActions.push(action);
      return reducer(state, action as any);
    }

    if (action.source === "server") {
      settledActions.push(action);
      settledState = reducer(settledState, action as any);

      const settlingAction = pendingActions.find((pendingAction) =>
        isEqual(action, pendingAction)
      );

      if (settlingAction) {
        // we found a match, the action is now settled, remove it from pending
        pendingActions.splice(pendingActions.indexOf(settlingAction), 1);
      } else {
        // does the server action invalidate any of our pending actions?
      }

      return pendingActions.reduce(
        (pendingState, pendingAction) =>
          reducer(pendingState, pendingAction as any),
        settledState
      );
    }

    return reducer(state, action);
  };
};

const initialState = {
  clients: {},
};

export const { dispatch, getState, subscribe } = createStore(
  immer(redux(withRollback(reducer), initialState))
);
