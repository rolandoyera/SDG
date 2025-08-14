"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import Button from "./ui/Button";

import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2 } from "lucide-react";

type Ctx = {
  open: () => void;
  close: () => void;
  toggle: () => void;
};

const ContactModalContext = createContext<Ctx | null>(null);

export const useContactModal = () => {
  const ctx = useContext(ContactModalContext);
  if (!ctx)
    throw new Error("useContactModal must be used within ContactModalProvider");
  return ctx;
};

export default function ContactModalProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  const openFn = useCallback(() => setOpen(true), []);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const value = useMemo(
    () => ({ open: openFn, close, toggle }),
    [openFn, close, toggle]
  );

  return (
    <ContactModalContext.Provider value={value}>
      {children}
      {open && <ContactModal onClose={close} />}
    </ContactModalContext.Provider>
  );
}

/* -------------------- Modal -------------------- */

const ContactSchema = z.object({
  name: z.string().min(2, "Please enter your full name"),
  phone: z
    .string()
    .trim()
    .min(1, "Phone is required")
    .refine(
      (v) => v.replace(/\D/g, "").length >= 10, // at least 10 digits
      "Enter a valid phone number"
    ),
  email: z.string().email("Enter a valid email"),
  company: z.string().optional(),
  ts: z.number().optional(),
});
type ContactValues = z.infer<typeof ContactSchema>;

function ContactModal({ onClose }: { onClose: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ContactValues>({
    resolver: zodResolver(ContactSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      company: "",
      ts: Date.now(),
    },
  });

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const closeTimer = React.useRef<number | null>(null);

  // clean up timer if modal unmounts/closes early
  useEffect(() => {
    return () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    };
  }, []);

  const onSubmit = async (data: ContactValues) => {
    setSubmitError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Request failed");
      reset();
      setSent(true);
      closeTimer.current = window.setTimeout(() => {
        setSent(false);
        onClose();
      }, 4800);
    } catch {
      setSubmitError("Something went wrong. Please try again.");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-title"
      className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop with dark + blur */}
      <button
        aria-label="Close contact form"
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />

      {/* Panel */}
      <div
        className="relative mx-4 w-full md:max-w-[600px] rounded-2xl bg-pop p-8 shadow-2xl transition-all duration-200 animate-in fade-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 cursor-pointer"
          aria-label="Close">
          ✕
        </button>

        {/* SUCCESS VIEW */}
        {sent ? (
          <div className="py-8 text-center" aria-live="assertive">
            <CheckCircle2 className="mx-auto h-12 w-12" />
            <h2 className="mt-4 text-xl font-semibold">Message sent</h2>
            <p className="mt-2 text-sm text-white/80">
              Thanks—your message is on its way. We’ll reach out shortly.
            </p>
            <Button onClick={onClose} className="mt-6 w-full">
              Close now
            </Button>
          </div>
        ) : (
          <>
            <h2
              id="contact-title"
              className="mb-1 text-2xl font-semibold text-white">
              Let’s talk about your project
            </h2>
            <p className="mb-10 text-white">
              Share a few details and we’ll reach out shortly.
            </p>

            <form
              onSubmit={handleSubmit(onSubmit)}
              noValidate
              className="space-y-6">
              {/* Honeypot */}
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="hidden"
                placeholder="Company"
                {...register("company")}
              />
              {/* Time trap */}
              <input
                type="hidden"
                value={Date.now()}
                {...register("ts", { valueAsNumber: true })}
              />

              <div>
                <label htmlFor="name" className="mb-1 block text-sm text-white">
                  Name
                </label>
                <input
                  id="name"
                  autoComplete="name"
                  placeholder="Your Name"
                  aria-invalid={!!errors.name || undefined}
                  aria-describedby={errors.name ? "name-error" : undefined}
                  className="w-full border border-gray-800 px-3 py-2 outline-none focus:ring-2 focus:ring-black/10 text-white"
                  {...register("name")}
                />
                {errors.name && (
                  <p id="name-error" className="mt-1 text-sm text-red-500">
                    {errors.name.message}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="phone"
                  className="mb-1 block text-sm text-white">
                  Phone
                </label>
                <input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  aria-invalid={!!errors.phone || undefined}
                  aria-describedby={errors.phone ? "phone-error" : undefined}
                  placeholder="Contact number"
                  className="w-full border border-gray-800 px-3 py-2 outline-none focus:ring-2 focus:ring-black/10 text-white"
                  {...register("phone")}
                />
                {errors.phone && (
                  <p id="phone-error" className="mt-1 text-sm text-red-500">
                    {errors.phone.message}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="mb-1 block text-sm text-white">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  aria-invalid={!!errors.email || undefined}
                  aria-describedby={errors.email ? "email-error" : undefined}
                  placeholder="Your Email"
                  className="w-full border border-gray-800 px-3 py-2 outline-none focus:ring-2 focus:ring-black/10 text-white"
                  {...register("email")}
                />
                {errors.email && (
                  <p id="email-error" className="mt-1 text-sm text-red-500">
                    {errors.email.message}
                  </p>
                )}
              </div>

              {submitError && (
                <p className="text-sm text-red-500" aria-live="polite">
                  {submitError}
                </p>
              )}

              <Button
                type="submit"
                disabled={isSubmitting}
                className="mt-2 w-full px-4 py-2 text-white shadow-md transition hover:opacity-90 disabled:opacity-60">
                {isSubmitting ? "Sending…" : "Submit"}
              </Button>
            </form>
          </>
        )}

        <div className="mt-8 text-center text-gray-500">
          <p>Sarvian Design Group</p>
          <p>
            {" "}
            <a
              href="tel:+19544444803"
              className="underline-offset-4 hover:underline hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded-sm"
              aria-label="Call Sarvian Design Group at 954-444-4803">
              954-444-4803
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
