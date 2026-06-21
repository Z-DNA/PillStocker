import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { createMedication, type NewMedicationInput } from "@/lib/medications/queries";

function asString(raw: FormDataEntryValue | null): string {
  return typeof raw === "string" ? raw : "";
}

// Empty/blank → null (not 0). Number("") === 0, so the empty check must come
// before parsing, or a blank count would forecast as "Out now" instead of
// "No forecast".
function parseOptionalNumber(raw: FormDataEntryValue | null): { value: number | null; invalid: boolean } {
  const trimmed = asString(raw).trim();
  if (trimmed === "") {
    return { value: null, invalid: false };
  }
  const num = Number(trimmed);
  if (Number.isNaN(num) || num < 0) {
    return { value: null, invalid: true };
  }
  return { value: num, invalid: false };
}

function optionalText(raw: FormDataEntryValue | null): string | null {
  const trimmed = asString(raw).trim();
  return trimmed === "" ? null : trimmed;
}

// Empty/blank → null. A non-empty value that doesn't parse as a date is
// rejected (defense-in-depth behind the native date input).
function optionalDate(raw: FormDataEntryValue | null): { value: string | null; invalid: boolean } {
  const trimmed = asString(raw).trim();
  if (trimmed === "") {
    return { value: null, invalid: false };
  }
  if (Number.isNaN(Date.parse(trimmed))) {
    return { value: null, invalid: true };
  }
  return { value: trimmed, invalid: false };
}

// Map the symbolic origin token to a hardcoded internal path. Never echoes a
// user-supplied URL, so there is no open-redirect surface.
function returnPathFor(from: string): string {
  return from === "shelf" ? "/medications/shelf" : "/medications";
}

// Redirect back to the add form, preserving the origin token so an error
// round-trip keeps the user's launch context.
function backToForm(message: string, from: string): string {
  const params = new URLSearchParams({ error: message });
  if (from) {
    params.set("from", from);
  }
  return `/medications/new?${params.toString()}`;
}

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(backToForm("Supabase is not configured", ""));
  }

  const user = context.locals.user;
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const form = await context.request.formData();
  const from = asString(form.get("from")).trim();

  const name = asString(form.get("name")).trim();
  if (!name) {
    return context.redirect(backToForm("Name is required", from));
  }

  const pillCount = parseOptionalNumber(form.get("pill_count"));
  const morning = parseOptionalNumber(form.get("dose_morning"));
  const midday = parseOptionalNumber(form.get("dose_midday"));
  const night = parseOptionalNumber(form.get("dose_night"));

  if (pillCount.invalid || morning.invalid || midday.invalid || night.invalid) {
    return context.redirect(backToForm("Counts and doses must be numbers ≥ 0", from));
  }

  const expiry = optionalDate(form.get("expiry_date"));
  if (expiry.invalid) {
    return context.redirect(backToForm("Expiry date is invalid", from));
  }

  const input: NewMedicationInput = {
    name,
    active_substance: optionalText(form.get("active_substance")),
    description: optionalText(form.get("description")),
    pill_count: pillCount.value,
    dose_morning: morning.value,
    dose_midday: midday.value,
    dose_night: night.value,
    expiry_date: expiry.value,
  };

  const { error } = await createMedication(supabase, user.id, input);
  if (error) {
    return context.redirect(backToForm(error.message, from));
  }

  return context.redirect(returnPathFor(from));
};
