import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDatabase } from "./database";
import type { User } from "./types";
export async function getUser(): Promise<User | null> {
  await cookies(); // Keep auth-dependent pages dynamic even before Supabase is configured.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )
    return null;
  const {
    data: { user },
    error,
  } = await (await getDatabase()).auth.getUser();
  if (error || !user) return null;
  return {
    id: user.id,
    email: user.email ?? "",
    name: user.user_metadata.name ?? user.email ?? "Creator",
  };
}
export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}
export async function endSession() {
  const { error } = await (await getDatabase()).auth.signOut();
  if (error) throw error;
}
