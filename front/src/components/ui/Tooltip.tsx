import React from 'react';

type TooltipProps = {
  label: string;
  children: React.ReactNode;
};

export function Tooltip({ label, children }: TooltipProps) {
  return (
    <div
      className="group relative flex items-center justify-center"
    >
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-full ml-4 top-1/2 -translate-y-1/2 scale-95 opacity-0 group-hover:scale-100 group-hover:opacity-100 transition-all duration-200 bg-black text-white text-[13px] font-bold px-3 py-1.5 rounded-lg whitespace-nowrap z-50 shadow-xl origin-left"
      >
        {label}
      </span>
    </div>
  );
}
