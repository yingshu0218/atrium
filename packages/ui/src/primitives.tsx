/**
 * 共享 UI primitives(AGENTS §16.4 / PRD §19.10)。
 * 全部样式使用 var(--atrium-*) 语义 token,禁止硬编码颜色值;
 * 语义化、可访问,纯图标交互必须有可访问名称(AGENTS §16.5)。
 */
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";
import { useId } from "react";

/** 拼接 className,过滤空值。 */
export function cx(
  ...parts: Array<string | false | null | undefined>
): string {
  return parts.filter(Boolean).join(" ");
}

export type ButtonVariant = "primary" | "ghost" | "danger";

const BUTTON_VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--atrium-primary)] text-[var(--atrium-primaryForeground)] hover:opacity-90",
  ghost:
    "bg-transparent text-[var(--atrium-foreground)] hover:bg-[var(--atrium-muted)]",
  danger:
    "bg-[var(--atrium-destructive)] text-[var(--atrium-primaryForeground)] hover:opacity-90",
};

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({
  variant = "primary",
  type = "button",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      data-variant={variant}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-[var(--atrium-radiusMd)] px-4 py-2",
        "text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--atrium-focusRing)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--atrium-background)]",
        "disabled:pointer-events-none disabled:opacity-50",
        BUTTON_VARIANT_CLASS[variant],
        className
      )}
      {...props}
    />
  );
}

export interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 可访问名称(纯图标按钮必须提供,AGENTS §16.5)。 */
  label: string;
}

export function IconButton({
  label,
  type = "button",
  className,
  children,
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex size-9 items-center justify-center rounded-[var(--atrium-radiusSm)]",
        "text-[var(--atrium-foreground)] transition-colors",
        "hover:bg-[var(--atrium-muted)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--atrium-focusRing)]",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

const FIELD_LABEL_CLASS =
  "text-sm font-medium text-[var(--atrium-foreground)]";

const FIELD_INPUT_CLASS = cx(
  "w-full rounded-[var(--atrium-radiusMd)] border border-[var(--atrium-border)]",
  "bg-[var(--atrium-card)] px-3 py-2 text-sm text-[var(--atrium-foreground)]",
  "placeholder:text-[var(--atrium-mutedForeground)]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--atrium-focusRing)]",
  "disabled:cursor-not-allowed disabled:opacity-50"
);

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function Input({ label, className, id, ...props }: InputProps) {
  const inputId = id ?? useId();
  return (
    <label htmlFor={inputId} className={cx("flex flex-col gap-1.5", className)}>
      <span className={FIELD_LABEL_CLASS}>{label}</span>
      <input id={inputId} className={FIELD_INPUT_CLASS} {...props} />
    </label>
  );
}

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
}

export function Textarea({ label, className, id, ...props }: TextareaProps) {
  const textareaId = id ?? useId();
  return (
    <label
      htmlFor={textareaId}
      className={cx("flex flex-col gap-1.5", className)}
    >
      <span className={FIELD_LABEL_CLASS}>{label}</span>
      <textarea id={textareaId} className={FIELD_INPUT_CLASS} {...props} />
    </label>
  );
}

export interface CardProps {
  title?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Card({ title, actions, className, children }: CardProps) {
  const hasHeader = title !== undefined || actions !== undefined;
  return (
    <section
      className={cx(
        "rounded-[var(--atrium-radiusLg)] border border-[var(--atrium-border)]",
        "bg-[var(--atrium-card)] text-[var(--atrium-foreground)]",
        "shadow-[var(--atrium-shadowSm)]",
        className
      )}
    >
      {hasHeader ? (
        <header className="flex items-center justify-between gap-4 border-b border-[var(--atrium-border)] px-5 py-4">
          {title !== undefined ? (
            <h2 className="text-base font-semibold">{title}</h2>
          ) : (
            <span />
          )}
          {actions !== undefined ? (
            <div className="flex items-center gap-2">{actions}</div>
          ) : null}
        </header>
      ) : null}
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}
