// components/ui/Button.tsx
import type {
  ButtonHTMLAttributes,
  DetailedHTMLProps,
  AnchorHTMLAttributes,
  ReactNode,
} from "react";
import Link from "next/link";
import clsx from "clsx";

type ButtonBaseProps = {
  children: ReactNode;
  className?: string;
};

type ButtonAsButton = DetailedHTMLProps<
  ButtonHTMLAttributes<HTMLButtonElement>,
  HTMLButtonElement
> &
  ButtonBaseProps & { href?: undefined };

type ButtonAsLink = DetailedHTMLProps<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  HTMLAnchorElement
> &
  ButtonBaseProps & {
    href: string;
  };

type ButtonProps = ButtonAsButton | ButtonAsLink;

export default function Button({
  children,
  className,
  href,
  ...props
}: ButtonProps) {
  const baseClasses = clsx(
    "border-0 cursor-pointer py-3 px-4 rounded-full bg-brand text-white duration-200 ease-out hover:brightness-95 active:translate-y-px text-[16px] focus-visible:ring-2 focus-visible:ring-[#c9b49a] focus-visible:ring-offset-2 focus-visible:ring-offset-white hover:scale-103 transition-all text-white",
    className
  );

  if (href) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { href: _, ...linkProps } = props as ButtonAsLink;
    return (
      <Link href={href} className={baseClasses} {...linkProps}>
        {children}
      </Link>
    );
  }

  // TypeScript now knows this is the button variant
  const buttonProps = props as ButtonAsButton;
  return (
    <button className={baseClasses} {...buttonProps}>
      {children}
    </button>
  );
}
