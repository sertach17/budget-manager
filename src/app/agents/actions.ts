"use server";

import { revalidatePath } from "next/cache";
import { requireTwoFactorUser } from "@/lib/auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Disconnects an AI agent. Supabase ends its sign-ins, and the database turns
// away its token from then on.
export async function disconnectAgent(clientId: string): Promise<{ ok: boolean; message: string }> {
  const { supabase } = await requireTwoFactorUser();
  if (!UUID.test(String(clientId))) return { ok: false, message: "That agent couldn't be found." };
  const { error } = await supabase.auth.oauth.revokeGrant({ clientId });
  if (error) {
    console.error("Disconnecting an agent failed:", error.message);
    return { ok: false, message: "Couldn't disconnect it. Try again." };
  }
  revalidatePath("/agents");
  return { ok: true, message: "Disconnected." };
}
