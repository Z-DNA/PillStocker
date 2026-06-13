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

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/medications/new?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const user = context.locals.user;
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const form = await context.request.formData();

  const name = asString(form.get("name")).trim();
  if (!name) {
    return context.redirect(`/medications/new?error=${encodeURIComponent("Name is required")}`);
  }

  const pillCount = parseOptionalNumber(form.get("pill_count"));
  const morning = parseOptionalNumber(form.get("dose_morning"));
  const midday = parseOptionalNumber(form.get("dose_midday"));
  const night = parseOptionalNumber(form.get("dose_night"));

  if (pillCount.invalid || morning.invalid || midday.invalid || night.invalid) {
    return context.redirect(`/medications/new?error=${encodeURIComponent("Counts and doses must be numbers ≥ 0")}`);
  }

  const input: NewMedicationInput = {
    name,
    active_substance: optionalText(form.get("active_substance")),
    description: optionalText(form.get("description")),
    pill_count: pillCount.value,
    dose_morning: morning.value,
    dose_midday: midday.value,
    dose_night: night.value,
  };

  const { error } = await createMedication(supabase, user.id, input);
  if (error) {
    return context.redirect(`/medications/new?error=${encodeURIComponent(error.message)}`);
  }

  return context.redirect("/medications");
};
