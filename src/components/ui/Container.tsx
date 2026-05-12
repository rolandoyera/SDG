import type { ReactNode } from "react";

interface ContainerProps {
  children: ReactNode;
  className?: string;
}

export default function Container({
  children,
  className = "",
}: ContainerProps) {
  return (
    <div className={`mx-auto max-w-[1900px] px-6 ${className}`}>{children}</div>
  );
}
