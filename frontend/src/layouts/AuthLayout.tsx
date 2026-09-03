import { Outlet } from "react-router-dom";
import { BrandLogo } from "@/components/BrandLogo";

export function AuthLayout() {
  return (
    <div className="relative flex min-h-screen flex-col justify-center overflow-hidden bg-[#161817] px-4 py-12 selection:bg-brand-500 selection:text-white">
      {/* Background ambient lighting */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-40 -top-40 size-[36rem] rounded-full bg-brand-600/15 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -right-40 size-[36rem] rounded-full bg-amber-600/10 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#32363415_1px,transparent_1px),linear-gradient(to_bottom,#32363415_1px,transparent_1px)] bg-[size:32px_32px]"
      />

      <div className="relative mx-auto w-full max-w-md">
        {/* Brand Header */}
        <div className="mb-6 animate-rise text-center flex flex-col items-center">
          <BrandLogo
            variant="full"
            size="xl"
            className="mb-2 max-w-[240px] drop-shadow-2xl"
          />
          <h1 className="text-xl font-black tracking-tight text-[#FAF8F5] font-sans">
            SPICE GARDEN
          </h1>
          <p className="mt-0.5 text-[11px] font-bold uppercase tracking-widest text-brand-400">
            Hospitality &amp; Point of Sale Suite
          </p>
        </div>

        {/* Card Container */}
        <div className="animate-pop rounded-2xl bg-white p-7 shadow-2xl shadow-black/40 ring-1 ring-[#E8E3D8] sm:p-9 border border-[#EBE7DF]">
          <Outlet />
        </div>

        <p className="mt-6 text-center text-xs text-[#8E908C]">
          Commercial Restaurant Billing &amp; Floor Management
        </p>
      </div>
    </div>
  );
}
