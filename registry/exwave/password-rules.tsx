"use client";

import type { PasswordCheck } from "@exwave-nexus/auth-react";
import { Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

/** The platform's password rules, ticked off as the password is typed. */
export function PasswordRules({
  check,
  id,
  className,
}: {
  check: PasswordCheck;
  id?: string;
  className?: string;
}) {
  if (check.rules.length === 0) return null;
  return (
    <ul id={id} className={cn("grid gap-1 text-sm", className)}>
      {check.rules.map(({ rule, ok, label }) => (
        <li
          key={rule}
          className={cn(
            "flex items-center gap-2",
            ok ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {ok ? (
            <Check className="size-3.5" aria-hidden="true" />
          ) : (
            <Circle className="size-3.5" aria-hidden="true" />
          )}
          <span>
            {label}
            <span className="sr-only">{ok ? " (done)" : " (needed)"}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
