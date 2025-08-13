import { ReactNode } from "react";
import clsx from "clsx";

interface MainProps {
  children: ReactNode;
  className?: string;
}

export default function Main({ children, className }: MainProps) {
  return (
    <main className={clsx("min-h-[calc(100vh-280px)]", className)}>
      {children}
    </main>
  );
}
