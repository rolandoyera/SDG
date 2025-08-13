"use client";

import { useContactModal } from "../ContactModalProvider";
import Button from "./Button";

export default function ContactButton({
  children = "Contact",
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  const { open } = useContactModal();
  return (
    <Button
      onClick={open}
      className={`shadow-md transition hover:opacity-90 ${className}`}>
      {children}
    </Button>
  );
}
