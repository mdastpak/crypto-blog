import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-contrast hover:opacity-90",
  secondary: "border border-border bg-surface text-text hover:bg-surface-muted",
  ghost: "text-text hover:bg-surface-muted",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4",
};

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md") {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors",
    "disabled:pointer-events-none disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
  );
}

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  className?: string;
}

export function Button({
  variant,
  size,
  className,
  type = "button",
  ...props
}: CommonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={cx(buttonClasses(variant, size), className)} {...props} />;
}

/** A link that looks like a button. */
export function ButtonLink({
  href,
  variant,
  size,
  className,
  children,
}: CommonProps & { href: string }) {
  return (
    <Link href={href} className={cx(buttonClasses(variant, size), className)}>
      {children}
    </Link>
  );
}
