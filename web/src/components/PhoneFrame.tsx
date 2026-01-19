import React from "react";

export function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen justify-center px-3">
      <div className="relative w-full max-w-[430px] min-w-[360px] h-[100dvh] bg-white shadow-xl rounded-3xl overflow-hidden border border-slate-200">
        {children}
      </div>
    </div>
  );
}
