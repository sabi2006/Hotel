export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-10 text-muted">
      <span
        aria-hidden
        className="size-5 animate-spin rounded-full border-2 border-line-strong border-t-brand-600"
      />
      <span className="text-sm">{label}...</span>
    </div>
  );
}

export function FullScreenLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <Spinner label={label} />
    </div>
  );
}

/** In-page fallback while a lazily loaded route downloads. */
export function PageLoader() {
  return <Spinner label="Loading" />;
}
