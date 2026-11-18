"use server";

import { isExwaveAuthError } from "@exwave/auth/next";
import { redirect } from "next/navigation";
import { describeError } from "@/lib/errors";
import { exwave } from "@/lib/exwave";

// Server Functions for the forms. Each one returns the state the form shows;
// errors come back as values because Next.js hides thrown messages.
export interface FormState {
  error?: string;
  code?: string;
  done?: boolean;
  email?: string;
}

const text = (data: FormData, name: string) =>
  String(data.get(name) ?? "").trim();
const secret = (data: FormData, name: string) => String(data.get(name) ?? "");

async function attempt(run: () => Promise<unknown>): Promise<FormState | null> {
  try {
    await run();
    return null;
  } catch (error) {
    return {
      error: describeError(error),
      code: isExwaveAuthError(error) ? error.code : undefined,
    };
  }
}

export async function signUpAction(
  _: FormState,
  data: FormData,
): Promise<FormState> {
  const email = text(data, "email");
  const failed = await attempt(() =>
    exwave.signUp({
      email,
      displayName: text(data, "displayName"),
      username: text(data, "username") || undefined,
      password: secret(data, "password"),
    }),
  );
  return failed ?? { done: true, email };
}

export async function resendAction(
  _: FormState,
  data: FormData,
): Promise<FormState> {
  const email = text(data, "email");
  return (
    (await attempt(() => exwave.resendVerification({ email }))) ?? {
      done: true,
      email,
    }
  );
}

export async function verifyEmailAction(
  userId: string,
  code: string,
): Promise<FormState> {
  return (
    (await attempt(() => exwave.verifyEmail({ userId, code }))) ?? {
      done: true,
    }
  );
}

export async function signInAction(
  _: FormState,
  data: FormData,
): Promise<FormState> {
  const login = text(data, "login");
  const failed = await attempt(() =>
    exwave.signIn({ login, password: secret(data, "password") }),
  );
  if (failed)
    return { ...failed, email: login.includes("@") ? login : undefined };
  redirect("/account");
}

export async function forgotPasswordAction(
  _: FormState,
  data: FormData,
): Promise<FormState> {
  return (
    (await attempt(() =>
      exwave.resetPassword({ email: text(data, "email") }),
    )) ?? {
      done: true,
    }
  );
}

export async function resetPasswordAction(
  _: FormState,
  data: FormData,
): Promise<FormState> {
  const failed = await attempt(() =>
    exwave.confirmPasswordReset({
      userId: text(data, "userId"),
      code: text(data, "code"),
      password: secret(data, "password"),
    }),
  );
  if (failed) return failed;
  redirect("/account");
}

export async function signOutAction(
  _: FormState,
  data: FormData,
): Promise<FormState> {
  const everywhere = data.get("everywhere") === "true";
  const failed = await attempt(() => exwave.signOut({ everywhere }));
  if (failed) return failed;
  redirect("/sign-in");
}
