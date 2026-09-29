import { useId } from "react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

interface FieldProps {
  label?: string;
  error?: string;
  hint?: string;
}

const CONTROL_CLASSES =
  "block w-full rounded-lg border-0 bg-white px-3 py-2.5 text-ink ring-1 ring-inset " +
  "ring-line placeholder:text-subtle transition-shadow duration-150 " +
  "hover:ring-line-strong focus:ring-2 focus:ring-inset focus:ring-brand-500 " +
  "disabled:cursor-not-allowed disabled:bg-surface-soft disabled:text-subtle text-sm";

function FieldShell({
  label,
  error,
  hint,
  htmlFor,
  children,
}: FieldProps & { htmlFor: string; children: ReactNode }) {
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-ink-soft">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-danger">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({
  label,
  error,
  hint,
  className = "",
  ...props
}: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <FieldShell label={label} error={error} hint={hint} htmlFor={id}>
      <input
        id={id}
        {...props}
        aria-invalid={Boolean(error)}
        className={[
          CONTROL_CLASSES,
          error ? "ring-danger focus:ring-danger bg-danger-soft/40" : "",
          className,
        ].join(" ")}
      />
    </FieldShell>
  );
}

export function Select({
  label,
  error,
  hint,
  className = "",
  children,
  ...props
}: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <FieldShell label={label} error={error} hint={hint} htmlFor={id}>
      <select
        id={id}
        {...props}
        aria-invalid={Boolean(error)}
        className={[
          CONTROL_CLASSES,
          "cursor-pointer",
          error ? "ring-danger focus:ring-danger bg-danger-soft/40" : "",
          className,
        ].join(" ")}
      >
        {children}
      </select>
    </FieldShell>
  );
}

export function Textarea({
  label,
  error,
  hint,
  className = "",
  ...props
}: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <FieldShell label={label} error={error} hint={hint} htmlFor={id}>
      <textarea
        id={id}
        {...props}
        aria-invalid={Boolean(error)}
        className={[
          CONTROL_CLASSES,
          error ? "ring-danger focus:ring-danger bg-danger-soft/40" : "",
          className,
        ].join(" ")}
      />
    </FieldShell>
  );
}
