import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { refillMedication } from "@/lib/medications/queries";
import { asString } from "@/lib/medications/parse";
import { returnPathFor } from "@/lib/medications/navigation";

// Redirect back to the manage page, scoping the error to the refill control
// (rendered next to "Update stock", not the edit form) and preserving origin.
function backToEdit(id: string, message: string, from: string): string {
  const params = new URLSearchParams({ refillError: message });
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

  // A signed whole-number adjustment: a positive value tops up, a negative one
  // corrects down. Blank / non-integer / zero is rejected here; the "would drop
  // below 0" guard lives in refillMedication (it needs the current count).
  const raw = asString(form.get("add_count")).trim();
  if (raw === "" || !/^-?\d+$/.test(raw)) {
    return context.redirect(backToEdit(id, "Enter a whole number to adjust the stock", from));
  }
  const delta = Number(raw);
  if (delta === 0) {
    return context.redirect(backToEdit(id, "Enter a non-zero amount", from));
  }

  const { error, notFound, negative } = await refillMedication(supabase, id, delta);
  if (notFound) {
    return context.redirect(backToEdit(id, "Medication not found", from));
  }
  if (negative) {
    return context.redirect(backToEdit(id, "That adjustment would drop the count below 0", from));
  }
  if (error) {
    return context.redirect(backToEdit(id, error.message, from));
  }

  return context.redirect(returnPathFor(from));
};
