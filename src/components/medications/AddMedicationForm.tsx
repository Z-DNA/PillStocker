import React, { useState } from "react";
import { Pill, Hash, Sunrise, Sun, Moon, FlaskConical, FileText, Plus } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";

interface Props {
  serverError?: string | null;
}

interface Values {
  name: string;
  pill_count: string;
  dose_morning: string;
  dose_midday: string;
  dose_night: string;
  active_substance: string;
  description: string;
}

const EMPTY: Values = {
  name: "",
  pill_count: "",
  dose_morning: "",
  dose_midday: "",
  dose_night: "",
  active_substance: "",
  description: "",
};

const NUMERIC_FIELDS = ["pill_count", "dose_morning", "dose_midday", "dose_night"] as const;

export default function AddMedicationForm({ serverError }: Props) {
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>({});

  function setField(field: keyof Values, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }

  function validate() {
    const next: Partial<Record<keyof Values, string>> = {};
    if (!values.name.trim()) {
      next.name = "Name is required";
    }
    for (const field of NUMERIC_FIELDS) {
      const raw = values[field].trim();
      if (raw === "") {
        continue;
      }
      const num = Number(raw);
      if (Number.isNaN(num) || num < 0) {
        next[field] = "Enter a number ≥ 0";
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
    }
  }

  return (
    <form method="POST" action="/api/medications" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="name"
        label="Name"
        value={values.name}
        onChange={(v) => {
          setField("name", v);
        }}
        placeholder="e.g. Metformin"
        error={errors.name}
        icon={<Pill className="size-4" />}
      />

      <FormField
        id="pill_count"
        type="number"
        label="Pill count"
        value={values.pill_count}
        onChange={(v) => {
          setField("pill_count", v);
        }}
        placeholder="e.g. 60"
        error={errors.pill_count}
        icon={<Hash className="size-4" />}
        hint={<p className="mt-1 text-xs text-blue-100/40">Leave blank to track this medication without a forecast.</p>}
      />

      <div>
        <p className="mb-1 block text-sm text-blue-100/80">Daily dose</p>
        <div className="grid grid-cols-3 gap-3">
          <FormField
            id="dose_morning"
            type="number"
            label="Morning"
            value={values.dose_morning}
            onChange={(v) => {
              setField("dose_morning", v);
            }}
            placeholder="0"
            error={errors.dose_morning}
            icon={<Sunrise className="size-4" />}
          />
          <FormField
            id="dose_midday"
            type="number"
            label="Midday"
            value={values.dose_midday}
            onChange={(v) => {
              setField("dose_midday", v);
            }}
            placeholder="0"
            error={errors.dose_midday}
            icon={<Sun className="size-4" />}
          />
          <FormField
            id="dose_night"
            type="number"
            label="Night"
            value={values.dose_night}
            onChange={(v) => {
              setField("dose_night", v);
            }}
            placeholder="0"
            error={errors.dose_night}
            icon={<Moon className="size-4" />}
          />
        </div>
      </div>

      <FormField
        id="active_substance"
        label="Active substance"
        value={values.active_substance}
        onChange={(v) => {
          setField("active_substance", v);
        }}
        placeholder="optional"
        icon={<FlaskConical className="size-4" />}
      />

      <FormField
        id="description"
        label="Description"
        value={values.description}
        onChange={(v) => {
          setField("description", v);
        }}
        placeholder="optional"
        icon={<FileText className="size-4" />}
      />

      <ServerError message={serverError} />

      <SubmitButton pendingText="Adding..." icon={<Plus className="size-4" />}>
        Add medication
      </SubmitButton>
    </form>
  );
}
