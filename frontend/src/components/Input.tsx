import { useId } from "react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

interface FieldProps {
  label?: string;
  error?: string;
  hint?: string;
}

const CONTROL_CLASSES =
  "block w-full rounded-xl border-0 bg-white px-3.5 py-2.5 text-[#1F2220] shadow-2xs ring-1 ring-inset " +
  "ring-[#E8E3D8] placeholder:text-[#9E9F9B] transition-all duration-150 " +
  "hover:ring-[#D8CEBE] focus:ring-2 focus:ring-inset focus:ring-brand-500 " +
  "disabled:cursor-not-allowed disabled:bg-[#FAF8F5] disabled:text-[#9E9F9B] text-sm";

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
        <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-bold text-[#424541] uppercase tracking-wider">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1.5 animate-rise text-xs font-semibold text-[#C24138] flex items-center gap-1">
          <span>⚠️</span>
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-[#6F716D]">{hint}</p>
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
          error ? "ring-[#C24138] focus:ring-[#C24138] bg-red-50/20" : "",
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
          error ? "ring-[#C24138] focus:ring-[#C24138] bg-red-50/20" : "",
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
          error ? "ring-[#C24138] focus:ring-[#C24138] bg-red-50/20" : "",
          className,
        ].join(" ")}
      />
    </FieldShell>
  );
}
