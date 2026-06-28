// Map the symbolic origin token to a hardcoded internal path. Never echoes a
// user-supplied URL, so there is no open-redirect surface. Shared by the
// create / edit / refill / archive handlers so a write returns the user to the
// view they launched from (the run-out list or the shelf).
export function returnPathFor(from: string): string {
  return from === "shelf" ? "/medications/shelf" : "/medications";
}
