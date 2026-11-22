"use client";

import { type ComponentProps, useState } from "react";
import { EyeIcon, EyeOffIcon } from "@/components/exwave/icons";

/** A password field, with a button that shows what was typed. */
export function PasswordInput(props: Omit<ComponentProps<"input">, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <div className="password">
      <input className="input" {...props} type={shown ? "text" : "password"} />
      <button
        type="button"
        aria-label="Show password"
        aria-pressed={shown}
        onClick={() => setShown(!shown)}
      >
        {shown ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}
