import { Outlet } from "react-router-dom";

import { BrandLogo } from "@/components/BrandLogo";

export function AuthLayout() {
  return (
    <div className="flex min-h-screen flex-col justify-center bg-canvas px-4 py-12">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandLogo variant="mark" size="lg" />
          <h1 className="mt-3 text-xl font-bold text-ink">Spice Garden</h1>
          <p className="mt-0.5 text-sm text-muted">Restaurant billing &amp; orders</p>
        </div>

        <div className="rounded-xl border border-line bg-white p-6 shadow-sm sm:p-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
