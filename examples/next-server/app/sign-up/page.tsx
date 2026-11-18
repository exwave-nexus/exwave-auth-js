import { connection } from "next/server";
import { exwave } from "@/lib/exwave";
import { SignUpForm } from "../forms";

export default async function SignUpPage() {
  // Read the policy per request (cached 60 s), never at build time.
  await connection();
  const config = await exwave.getConfig().catch(() => null);
  return <SignUpForm policy={config?.passwordPolicy ?? null} />;
}
