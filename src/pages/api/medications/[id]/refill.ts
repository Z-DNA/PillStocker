import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { refillMedication } from "@/lib/medications/queries";
import { parseOptionalNumber } from "@/lib/medications/parse";

// Redirect back to the manage page, preserving the error message.
function backToEdit(id: string, message: string): string {
  const params = new URLSearchParams({ error: message });
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

  // Refill is additive and strictly positive: blank, non-numeric, or ≤ 0 is
  // rejected (parseOptionalNumber returns null for blank, invalid for < 0).
  const addCount = parseOptionalNumber(form.get("add_count"));
  if (addCount.invalid || addCount.value === null || addCount.value <= 0) {
    return context.redirect(backToEdit(id, "Enter a refill amount greater than 0"));
  }

  const { error, notFound } = await refillMedication(supabase, id, addCount.value);
  if (notFound) {
    return context.redirect(backToEdit(id, "Medication not found"));
  }
  if (error) {
    return context.redirect(backToEdit(id, error.message));
  }

  return context.redirect("/medications");
};
