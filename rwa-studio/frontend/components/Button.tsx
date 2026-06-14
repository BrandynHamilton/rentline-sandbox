import { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "outline";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantClass: Record<Variant, string> = {
  primary:   "bg-[var(--color-crimson)] hover:bg-[var(--color-crimson-bright)] text-white font-medium",
  secondary: "bg-[var(--color-blue)] hover:bg-[var(--color-blue-bright)] text-white font-medium",
  danger:    "bg-[var(--color-destructive)] hover:opacity-90 text-white",
  ghost:     "bg-transparent hover:bg-[var(--sidebar-accent)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]",
  outline:   "border border-[var(--color-border)] bg-transparent hover:bg-[var(--sidebar-accent)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]",
};

const sizeClass: Record<Size, string> = {
  sm: "px-2.5 py-1 text-xs rounded-[min(var(--radius-md,8px),12px)]",
  md: "px-3.5 py-2 text-sm rounded-lg",
  lg: "px-4 py-2.5 text-sm rounded-lg",
};

export default function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  children,
  className = "",
  ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center gap-1.5 transition-all cursor-pointer select-none
        disabled:opacity-50 disabled:cursor-not-allowed
        active:not-aria-[haspopup]:translate-y-px
        ${variantClass[variant]} ${sizeClass[size]} ${className}`}
      {...rest}
    >
      {loading && (
        <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
      )}
      {children}
    </button>
  );
}
