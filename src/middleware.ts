import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = ["/dashboard", "/medications"];

export const onRequest = defineMiddleware(async (context, next) => {
  // /dashboard is retired; the authenticated landing is the run-out list. Its
  // slot is reserved for the future cabinet-summary slice (S-04).
  if (context.url.pathname === "/dashboard") {
    return context.redirect("/medications");
  }

  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  return next();
});
