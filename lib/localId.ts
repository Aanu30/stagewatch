"use client";

import { LOCAL_ID_COOKIE } from "./constants";

const KEY = "stagewatch_local_id";

// The anonymous identity. Generated in the browser, stored in localStorage,
// never sent anywhere except as the owner of the caller's own rows, and never
// displayed publicly.
//
// It is also mirrored into a cookie so the server can decide the soft gate
// during render. The server sets that cookie on a successful submission; this
// function sets it too, so that a visitor who has an id from a previous
// session gets the gate evaluated correctly on their very first page view.
export function getLocalId(): string {
  if (typeof window === "undefined") {
    throw new Error("getLocalId is browser-only.");
  }

  let id = window.localStorage.getItem(KEY);

  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(KEY, id);
  }

  mirrorToCookie(id);
  return id;
}

export function peekLocalId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY);
}

function mirrorToCookie(id: string) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${LOCAL_ID_COOKIE}=${id}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}

// Called once on mount from the layout, so an existing localStorage id is
// reflected into the cookie even on a page the user does not interact with.
export function ensureCookieMirror() {
  const id = peekLocalId();
  if (id) mirrorToCookie(id);
}
