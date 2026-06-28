import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { updateMedication, type EditMedicationInput } from "@/lib/medications/queries";
import { asString, optionalDate, optionalText, parseOptionalNumber } from "@/lib/medications/parse";
import { returnPathFor } from "@/lib/medications/navigation";

// Redirect back to the manage page, preserving the error message + origin token.
function backToEdit(id: string, message: string, from: string): string {
  const params = new URLSearchParams({ error: message });
  if (from) {
    params.set("from", from);
  }
  return `/medications/${id}/edit?${params.toString()}`;
}

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect("/medications");
  }

  const user = context.locals.user;
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const id = context.params.id;
  if (!id) {
    return context.redirect("/medications");
  }

  const form = await context.request.formData();
  const from = asString(form.get("from")).trim();

  const name = asString(form.get("name")).trim();
  if (!name) {
    return context.redirect(backToEdit(id, "Name is required", from));
  }

  const pillCount = parseOptionalNumber(form.get("pill_count"));
  const morning = parseOptionalNumber(form.get("dose_morning"));
  const midday = parseOptionalNumber(form.get("dose_midday"));
  const night = parseOptionalNumber(form.get("dose_night"));

  if (pillCount.invalid || morning.invalid || midday.invalid || night.invalid) {
    return context.redirect(backToEdit(id, "Counts and doses must be numbers ≥ 0", from));
  }

  const expiry = optionalDate(form.get("expiry_date"));
  if (expiry.invalid) {
    return context.redirect(backToEdit(id, "Expiry date is invalid", from));
  }

  const input: EditMedicationInput = {
    name,
    active_substance: optionalText(form.get("active_substance")),
    description: optionalText(form.get("description")),
    pill_count: pillCount.value,
    dose_morning: morning.value,
    dose_midday: midday.value,
    dose_night: night.value,
    expiry_date: expiry.value,
  };

  const { error, notFound } = await updateMedication(supabase, id, input);
  if (notFound) {
    return context.redirect(backToEdit(id, "Medication not found", from));
  }
  if (error) {
    return context.redirect(backToEdit(id, error.message, from));
  }

  return context.redirect(returnPathFor(from));
};
