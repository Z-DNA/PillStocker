import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/database.types";

export type MedicationRow = Tables<"medications">;

export interface NewMedicationInput {
  name: string;
  active_substance: string | null;
  description: string | null;
  pill_count: number | null;
  dose_morning: number | null;
  dose_midday: number | null;
  dose_night: number | null;
}

/**
 * Active (non-archived) medications for the signed-in user. RLS scopes the rows
 * to the owner, so no explicit user_id filter is needed. Throws on a query
 * error so callers can tell "no meds" apart from "query failed".
 */
export async function getActiveMedications(supabase: SupabaseClient<Database>): Promise<MedicationRow[]> {
  const result = await supabase.from("medications").select("*").is("archived_at", null);
  if (result.error) {
    throw result.error;
  }
  return result.data;
}

/**
 * Insert one medication owned by `userId`. The RLS `with check` policy enforces
 * that `userId` matches the authenticated user.
 */
export async function createMedication(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: NewMedicationInput,
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase.from("medications").insert({ user_id: userId, ...input });
  return { error };
}
