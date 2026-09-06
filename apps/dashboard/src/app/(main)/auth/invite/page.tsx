"use client";

import { Suspense, useEffect, useState } from "react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { Eye, EyeOff, XIcon } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { LoadingState } from "@/components/loading-state";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { auth, db } from "@/lib/firebase";
import { formatPhone, isValidUsPhone } from "@/lib/utils";

const inviteFormSchema = z
  .object({
    fullName: z
      .string()
      .min(1, "Please enter your name.")
      .max(100)
      .refine(
        (val) => val.trim().split(/\s+/).length >= 2,
        "Please enter both your first and last name.",
      ),
    displayName: z
      .string()
      .min(3, "Username must be at least 3 characters.")
      .max(30, "Username must be 30 characters or less.")
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        "Username can only contain letters, numbers, underscores, and hyphens (no spaces).",
      ),
    location: z
      .string()
      .regex(/^\d{5}$/, "Please enter a valid 5-digit ZIP code."),
    phone: z
      .string()
      .min(1, "Please enter your phone number.")
      .refine(isValidUsPhone, "Please enter a valid 10-digit US phone number."),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .max(100)
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter.")
      .regex(/[a-z]/, "Password must contain at least one lowercase letter.")
      .regex(/[0-9]/, "Password must contain at least one number."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

type InviteFormData = z.infer<typeof inviteFormSchema>;

interface PendingInviteData {
  fullName?: string;
  organizationId?: string;
  role?: string;
  status?: string;
}

function hasFirebaseCode(error: unknown, code: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

function InviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email");

  const [isVerifying, setIsVerifying] = useState(true);
  const [isValid, setIsValid] = useState(false);
  const [pendingData, setPendingData] = useState<PendingInviteData | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const { control, handleSubmit, reset } = useForm<InviteFormData>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: {
      fullName: "",
      displayName: "",
      location: "",
      phone: "",
      password: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    if (!email) {
      setIsVerifying(false);
      return;
    }

    const verifyInvite = async () => {
      try {
        const docRef = doc(db, "users", email.trim().toLowerCase());
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().status === "Pending") {
          const data = docSnap.data() as PendingInviteData;
          setPendingData(data);
          setIsValid(true);
          reset({
            fullName: data.fullName || "",
            displayName: "",
            location: "",
            phone: "",
            password: "",
            confirmPassword: "",
          });
        }
      } catch (e) {
        console.error("Verification error:", e);
      } finally {
        setIsVerifying(false);
      }
    };

    void verifyInvite();
  }, [email, reset]);

  const onSubmit = async (data: InviteFormData) => {
    if (!email) return;
    // Access is invite-only: the pending doc must name the org and role.
    if (!pendingData?.organizationId || !pendingData?.role) {
      toast.error(
        "This invitation is incomplete. Ask your administrator to send a new invite.",
      );
      return;
    }
    setIsSubmitting(true);

    try {
      const emailKey = email.trim().toLowerCase();

      // 1. Create user in Firebase Authentication
      const userCred = await createUserWithEmailAndPassword(
        auth,
        emailKey,
        data.password,
      );

      // Update the user's Auth profile with the entered Display Name
      await updateProfile(userCred.user, {
        displayName: data.displayName.trim(),
      });

      // 2. Create permanent active user document keyed by UID
      await setDoc(doc(db, "users", userCred.user.uid), {
        fullName: data.fullName.trim(),
        displayName: data.displayName.trim(),
        email: emailKey,
        role: pendingData.role,
        organizationId: pendingData.organizationId,
        location: data.location.trim(),
        phone: data.phone.trim(),
        status: "Active",
        joinedDate: format(new Date(), "dd MMM yyyy, h:mm a"),
        lastActive: Date.now(),
      });

      // 3. Delete temporary invitation document keyed by email
      await deleteDoc(doc(db, "users", emailKey));

      toast.success("Account created and activated successfully!");
      router.push("/dashboard");
    } catch (e: unknown) {
      console.error("Setup error:", e);
      let errorMsg = "Failed to create account. Please try again.";
      if (hasFirebaseCode(e, "auth/email-already-in-use")) {
        errorMsg = "An account with this email address already exists.";
      }
      toast.error(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isVerifying) {
    return (
      <LoadingState label="Verifying Invitation" className="min-h-[40vh]" />
    );
  }

  if (!isValid) {
    return (
      <div className="mx-auto flex w-full flex-col justify-center space-y-6 text-center sm:w-[350px]">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <XIcon className="size-8" />
        </div>
        <div className="space-y-2">
          <h1 className="font-semibold text-2xl">Invalid or Expired Invite</h1>
          <p className="text-muted-foreground text-sm">
            This invitation link has expired, is invalid, or has already been
            used. Please contact your administrator.
          </p>
        </div>
        <Button asChild className="w-full">
          <Link href="/auth/login">Back to Login</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
      <div className="space-y-2 text-center">
        <h1 className="font-medium text-3xl">Set up your account</h1>
        <p className="text-muted-foreground text-sm leading-snug">
          Welcome,{" "}
          <span className="font-medium text-foreground">
            {pendingData?.fullName}
          </span>
          ! Please complete your details to activate your account.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        {/* Email Address (Read-only for reference & credential autofill) */}
        <Field className="gap-1.5">
          <FieldLabel htmlFor="invite-email">Email Address</FieldLabel>
          <Input
            id="invite-email"
            value={email || ""}
            disabled
            readOnly
            autoComplete="username"
            className="cursor-not-allowed bg-muted/50"
          />
        </Field>

        {/* Full Name */}
        <Controller
          control={control}
          name="fullName"
          render={({ field, fieldState }) => (
            <Field className="gap-1.5" data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="invite-fullName">Full Name</FieldLabel>
              <Input
                {...field}
                id="invite-fullName"
                disabled={isSubmitting}
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        {/* Username / Display Name */}
        <Controller
          control={control}
          name="displayName"
          render={({ field, fieldState }) => (
            <Field className="gap-1.5" data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="invite-displayName">
                Username / Display Name
              </FieldLabel>
              <Input
                {...field}
                id="invite-displayName"
                autoComplete="off"
                disabled={isSubmitting}
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        {/* Location */}
        <Controller
          control={control}
          name="location"
          render={({ field, fieldState }) => (
            <Field className="gap-1.5" data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="invite-location">Location</FieldLabel>
              <Input
                {...field}
                id="invite-location"
                placeholder="5-digit ZIP code"
                disabled={isSubmitting}
                aria-invalid={fieldState.invalid}
                onChange={(e) => {
                  const clean = e.target.value.replace(/\D/g, "").slice(0, 5);
                  field.onChange(clean);
                }}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        {/* Phone */}
        <Controller
          control={control}
          name="phone"
          render={({ field, fieldState }) => (
            <Field className="gap-1.5" data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="invite-phone">Phone Number</FieldLabel>
              <Input
                {...field}
                autoComplete="tel"
                id="invite-phone"
                disabled={isSubmitting}
                aria-invalid={fieldState.invalid}
                placeholder="(555) 555-5555"
                onChange={(e) => {
                  const formatted = formatPhone(e.target.value);
                  field.onChange(formatted);
                }}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        {/* Password */}
        <Controller
          control={control}
          name="password"
          render={({ field, fieldState }) => (
            <Field className="gap-1.5" data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="invite-password">Password</FieldLabel>
              <div className="relative flex items-center">
                <Input
                  {...field}
                  id="invite-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  disabled={isSubmitting}
                  aria-invalid={fieldState.invalid}
                  className="w-full pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 flex cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground focus:outline-none"
                  disabled={isSubmitting}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        {/* Confirm Password */}
        <Controller
          control={control}
          name="confirmPassword"
          render={({ field, fieldState }) => (
            <Field className="gap-1.5" data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="invite-confirmPassword">
                Confirm Password
              </FieldLabel>
              <div className="relative flex items-center">
                <Input
                  {...field}
                  id="invite-confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  disabled={isSubmitting}
                  aria-invalid={fieldState.invalid}
                  className="w-full pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 flex cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground focus:outline-none"
                  disabled={isSubmitting}
                  aria-label={
                    showConfirmPassword ? "Hide password" : "Show password"
                  }
                >
                  {showConfirmPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Button className="mt-2 w-full" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating Account..." : "Create Account & Activate"}
        </Button>
      </form>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense
      fallback={
        <LoadingState label="Verifying Invitation" className="min-h-[40vh]" />
      }
    >
      <InviteContent />
    </Suspense>
  );
}
