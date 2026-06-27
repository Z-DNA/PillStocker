export function asString(raw: FormDataEntryValue | null): string {
  return typeof raw === "string" ? raw : "";
}

// Empty/blank → null (not 0). Number("") === 0, so the empty check must come
// before parsing, or a blank count would forecast as "Out now" instead of
// "No forecast".
export function parseOptionalNumber(raw: FormDataEntryValue | null): { value: number | null; invalid: boolean } {
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

export function optionalText(raw: FormDataEntryValue | null): string | null {
  const trimmed = asString(raw).trim();
  return trimmed === "" ? null : trimmed;
}

// Empty/blank → null. A non-empty value must be a real ISO date in the exact
// YYYY-MM-DD shape the shelf view parses (and the native date input emits);
// anything else is rejected (defense-in-depth against crafted POSTs).
export function optionalDate(raw: FormDataEntryValue | null): { value: string | null; invalid: boolean } {
  const trimmed = asString(raw).trim();
  if (trimmed === "") {
    return { value: null, invalid: false };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed) || Number.isNaN(Date.parse(trimmed))) {
    return { value: null, invalid: true };
  }
  return { value: trimmed, invalid: false };
}
