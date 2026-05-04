"use client";

import {
  createStore,
  get as idbGet,
  set as idbSet,
  del as idbDel,
  type UseStore,
} from "idb-keyval";
import { USER_ASSETS_DB, USER_ASSETS_STORE } from "@/lib/constants";

let store: UseStore | null = null;

function getStore(): UseStore {
  if (store) return store;
  store = createStore(USER_ASSETS_DB, USER_ASSETS_STORE);
  return store;
}

export async function putBlob(id: string, blob: Blob): Promise<void> {
  await idbSet(id, blob, getStore());
}

export async function getBlob(id: string): Promise<Blob | undefined> {
  return await idbGet<Blob>(id, getStore());
}

export async function deleteBlob(id: string): Promise<void> {
  await idbDel(id, getStore());
}
