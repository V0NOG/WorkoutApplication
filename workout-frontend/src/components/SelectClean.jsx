// src/components/SelectClean.jsx
import React from "react";

export default function SelectClean({ value, onChange, children, className = "", ...rest }) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={onChange}
        {...rest}
        className="appearance-none [-webkit-appearance:none] [-moz-appearance:none]
                   w-full h-[42px] pl-3 pr-9 rounded-xl
                   bg-background text-foreground
                   border border-input
                   focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring
                   placeholder:text-muted-foreground"
      >
        {children}
      </select>
      <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
             xmlns="http://www.w3.org/2000/svg"
             className="text-muted-foreground">
          <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    </div>
  );
}