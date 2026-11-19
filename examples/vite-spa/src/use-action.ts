import type { PasswordPolicy } from "@exwave-nexus/auth";
import { type FormEvent, useState } from "react";
import { describeError } from "./errors";

/** Runs a form action, with a pending flag and the error to show. */
export function useAction<T>(
  action: (data: FormData) => Promise<T>,
  /** Lets a weak-password message say how many characters. */
  policy?: PasswordPolicy | null,
) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<T | null>(null);
  const [done, setDone] = useState(false);
  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    setDone(false);
    try {
      setResult(await action(new FormData(event.currentTarget)));
      setDone(true);
    } catch (failure) {
      setError(failure);
    } finally {
      setPending(false);
    }
  };
  return {
    pending,
    error,
    message: error ? describeError(error, policy) : null,
    result,
    /** The last submission succeeded. */
    done,
    onSubmit,
  };
}

/** A trimmed text field. Passwords go through `secret()`, untouched. */
export const field = (data: FormData, name: string) =>
  String(data.get(name) ?? "").trim();
export const secret = (data: FormData, name: string) =>
  String(data.get(name) ?? "");
