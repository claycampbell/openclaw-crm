import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  showText?: boolean;
}

export function Logo({ className, size = "md", showText = true }: LogoProps) {
  const sizes = {
    sm: { icon: 20, text: "text-sm" },
    md: { icon: 24, text: "text-base" },
    lg: { icon: 32, text: "text-xl" },
  };

  const s = sizes[size];

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <svg
        width={s.icon}
        height={s.icon}
        viewBox="0 0 32 32"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        <defs>
          <linearGradient id="logo-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#4f46e5" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="8" fill="url(#logo-bg)" />
        <path
          d="M16 6 L9 24 L12.5 24 L14 20 L18 20 L19.5 24 L23 24 Z M15 17 L16 13.5 L17 17 Z"
          fill="#fff"
          fillOpacity="0.95"
        />
        <line x1="7" y1="10" x2="10" y2="14" stroke="#c7d2fe" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
        <line x1="6" y1="13" x2="9" y2="17" stroke="#c7d2fe" strokeWidth="1.5" strokeLinecap="round" opacity="0.45" />
        <line x1="5.5" y1="16" x2="8" y2="20" stroke="#c7d2fe" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />
      </svg>
      {showText && (
        <span className={cn("font-semibold tracking-tight", s.text)}>
          Aria
        </span>
      )}
    </div>
  );
}

export function LogoMark({ className, size = 24 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="mark-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#4f46e5" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#mark-bg)" />
      <path
        d="M16 6 L9 24 L12.5 24 L14 20 L18 20 L19.5 24 L23 24 Z M15 17 L16 13.5 L17 17 Z"
        fill="#fff"
        fillOpacity="0.95"
      />
      <line x1="7" y1="10" x2="10" y2="14" stroke="#c7d2fe" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      <line x1="6" y1="13" x2="9" y2="17" stroke="#c7d2fe" strokeWidth="1.5" strokeLinecap="round" opacity="0.45" />
      <line x1="5.5" y1="16" x2="8" y2="20" stroke="#c7d2fe" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />
    </svg>
  );
}
