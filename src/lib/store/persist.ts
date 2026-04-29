import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";
import type { StateStorage } from "zustand/middleware";

export const idbStateStorage: StateStorage = {
  getItem: async (name) => {
    const value = await idbGet<string>(name);
    return value ?? null;
  },
  setItem: async (name, value) => {
    await idbSet(name, value);
  },
  removeItem: async (name) => {
    await idbDel(name);
  },
};
