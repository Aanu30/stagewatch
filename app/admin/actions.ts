"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  ADMIN_COOKIE,
  approveQueueItem,
  checkPassword,
  isAdmin,
  mergeQueueItem,
  rejectQueueItem,
} from "@/lib/admin";

// Server actions rather than an API route. The admin page is the only caller,
// the payloads are plain form fields, and this keeps the whole feature to two
// files.

export async function loginAction(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  if (!checkPassword(password)) {
    return; // Silent. A wrong password reveals nothing about why.
  }

  const store = await cookies();
  store.set(ADMIN_COOKIE, password, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/admin",
    maxAge: 60 * 60 * 12,
  });

  revalidatePath("/admin");
}

export async function logoutAction() {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
  revalidatePath("/admin");
}

// Every action re-checks admin status server-side. The page hiding the buttons
// is a convenience, not the control: without this check, anyone who knew the
// action's endpoint could invoke it.
export async function approveAction(formData: FormData) {
  if (!(await isAdmin())) return;
  const id = Number(formData.get("id"));
  const category = String(formData.get("category") ?? "");
  if (!Number.isInteger(id)) return;
  await approveQueueItem(id, category);
  revalidatePath("/admin");
}

export async function mergeAction(formData: FormData) {
  if (!(await isAdmin())) return;
  const id = Number(formData.get("id"));
  const target = String(formData.get("target") ?? "");
  if (!Number.isInteger(id) || !target) return;
  await mergeQueueItem(id, target);
  revalidatePath("/admin");
}

export async function rejectAction(formData: FormData) {
  if (!(await isAdmin())) return;
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  await rejectQueueItem(id);
  revalidatePath("/admin");
}
