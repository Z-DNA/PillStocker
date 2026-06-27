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
  expiry_date: string | null;
}

// Edit sets every field to an absolute value, so it shares the create field set.
// Aliased for call-site clarity.
export type EditMedicationInput = NewMedicationInput;

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

/**
 * Fetch one active (non-archived) medication by id. RLS scopes the row to the
 * owner, so a not-owned id resolves to `null` exactly like a missing one.
 * Returns `null` for "no row"; throws on any other Postgrest error so callers
 * can tell "not found" apart from "query failed".
 */
export async function getMedicationById(supabase: SupabaseClient<Database>, id: string): Promise<MedicationRow | null> {
  const result = await supabase.from("medications").select("*").eq("id", id).is("archived_at", null).maybeSingle();
  if (result.error) {
    throw result.error;
  }
  return result.data;
}

/**
 * Absolute edit of one active medication. RLS + the `archived_at IS NULL` filter
 * mean a not-owned / missing / already-archived id matches 0 rows, surfaced as
 * `notFound` (never a silent success). `.select()` returns the affected rows so
 * the 0-row case is detectable without an error.
 */
export async function updateMedication(
  supabase: SupabaseClient<Database>,
  id: string,
  input: EditMedicationInput,
): Promise<{ error: PostgrestError | null; notFound: boolean }> {
  const { data, error } = await supabase
    .from("medications")
    .update(input)
    .eq("id", id)
    .is("archived_at", null)
    .select();
  if (error) {
    return { error, notFound: false };
  }
  return { error: null, notFound: data.length === 0 };
}

/**
 * Additive top-up: read the current count (null → 0), add `addCount` (caller
 * guarantees > 0), and write the sum. Read-then-write; a concurrent
 * double-refill could lose an update — accepted at single-user MVP scale. A
 * null fetch (missing / not-owned / archived) surfaces as `notFound`.
 */
export async function refillMedication(
  supabase: SupabaseClient<Database>,
  id: string,
  addCount: number,
): Promise<{ error: PostgrestError | null; notFound: boolean }> {
  let current: MedicationRow | null;
  try {
    current = await getMedicationById(supabase, id);
  } catch (err) {
    return { error: err as PostgrestError, notFound: false };
  }
  if (!current) {
    return { error: null, notFound: true };
  }
  const { data, error } = await supabase
    .from("medications")
    .update({ pill_count: (current.pill_count ?? 0) + addCount })
    .eq("id", id)
    .is("archived_at", null)
    .select();
  if (error) {
    return { error, notFound: false };
  }
  return { error: null, notFound: data.length === 0 };
}

/**
 * Soft-delete: set `archived_at` so the med leaves all active views while its
 * row is preserved. Filtered by `archived_at IS NULL`, so a second archive (or
 * a not-owned id) matches 0 rows → `notFound`. Never issues a DELETE.
 */
export async function archiveMedication(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<{ error: PostgrestError | null; notFound: boolean }> {
  const { data, error } = await supabase
    .from("medications")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .is("archived_at", null)
    .select();
  if (error) {
    return { error, notFound: false };
  }
  return { error: null, notFound: data.length === 0 };
}
