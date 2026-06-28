import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { archiveMedication } from "@/lib/medications/queries";
import { asString } from "@/lib/medications/parse";
import { returnPathFor } from "@/lib/medications/navigation";

// Redirect back to the manage page, scoping the error to the archive control
// (rendered next to "Archive", not the edit form) and preserving origin.
function backToEdit(id: string, message: string, from: string): string {
  const params = new URLSearchParams({ archiveError: message });
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

  // Soft-delete only. archiveMedication filters `archived_at IS NULL`, so a
  // second archive (or a not-owned id) matches 0 rows → notFound. Never deletes.
  const { error, notFound } = await archiveMedication(supabase, id);
  if (notFound) {
    return context.redirect(backToEdit(id, "Medication not found", from));
  }
  if (error) {
    return context.redirect(backToEdit(id, error.message, from));
  }

  return context.redirect(returnPathFor(from));
};
