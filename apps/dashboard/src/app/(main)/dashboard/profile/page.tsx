"use client";

import { Suspense, useEffect, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { updateProfile } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import {
  Edit,
  Mail,
  MapPin,
  MoreVertical,
  Phone,
  Sparkles,
} from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { LoadingState } from "@/components/loading-state";
import { FadeIn } from "@/components/fade-in";
import { useAuth } from "@/components/auth-context";
import { PageTitle } from "@/components/page-title-updater";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  TooltipDropdownMenu,
} from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { db } from "@/lib/firebase";
import { formatPhone, getInitials } from "@/lib/utils";
import { resendInvite } from "@/server/invite-actions";

import { buildProfileSavePayload } from "./profile-payloads";
import { profileSchema, type ProfileFormData } from "./profile-schema";

interface FirestoreProfile {
  fullName: string;
  displayName?: string;
  role: string;
  phone: string;
  location: string;
  email: string;
  status?: string;
}

function ProfileContent() {
  const searchParams = useSearchParams();
  const profileUid = searchParams.get("uid");
  const router = useRouter();
  const {
    user: currentUser,
    profile: loggedInProfile,
    loading: authLoading,
  } = useAuth();

  const [loading, setLoading] = useState(true);
  const [savingGeneral, setSavingGeneral] = useState(false);

  // General profile state
  const [displayName, setDisplayName] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [email, setEmail] = useState("");
  const [isRoleDisabled, setIsRoleDisabled] = useState(true);
  const [isSelf, setIsSelf] = useState(true);
  const [status, setStatus] = useState("Active");
  const [isResending, setIsResending] = useState(false);
  const [loggedInUserRole, setLoggedInUserRole] = useState("Contributor");

  // Edit Modal states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const profileForm = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: "",
      fullName: "",
      role: "Contributor",
      phone: "",
      location: "",
    },
  });

  useEffect(() => {
    if (isEditModalOpen) {
      profileForm.reset({
        displayName,
        fullName,
        role,
        phone,
        location,
      });
    }
  }, [
    isEditModalOpen,
    displayName,
    fullName,
    role,
    phone,
    location,
    profileForm,
  ]);

  const handleResendInvite = async () => {
    if (!email) return;
    setIsResending(true);
    try {
      const emailKey = email.trim().toLowerCase();
      if (!currentUser) throw new Error("No authenticated user.");
      const authToken = await currentUser.getIdToken();
      await resendInvite({ authToken, email: emailKey });

      toast.success("Invitation email resent successfully!");
    } catch (error) {
      console.error("Error resending invitation:", error);
      toast.error("Failed to resend invitation. Please try again.");
    } finally {
      setIsResending(false);
    }
  };

  useEffect(() => {
    if (authLoading || !loggedInProfile || !currentUser) return;
    const currentUid = currentUser.uid;
    const currentDisplayName = currentUser.displayName || "";
    const currentEmail = currentUser.email || "";
    const loggedInOrgId = loggedInProfile.organizationId;
    const loggedInRole = loggedInProfile.role;

    // Determine which UID to fetch
    const activeUid =
      profileUid && profileUid !== currentUid ? profileUid : currentUid;
    const isSelf = activeUid === currentUid;
    setIsSelf(isSelf);

    // Editable if it is their own profile OR if the logged-in user is an Admin
    const readOnly = !isSelf && loggedInRole !== "Admin";

    // Role is editable ONLY if the logged-in user is an Admin AND it is someone else's profile!
    const isRoleEditable = loggedInRole === "Admin" && !isSelf;
    setIsRoleDisabled(!isRoleEditable);

    setLoggedInUserRole(loggedInRole);

    async function loadData() {
      try {
        // Fetch additional profile data from Firestore
        const userDocRef = doc(db, "users", activeUid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const data = userDocSnap.data() as FirestoreProfile & {
            organizationId?: string;
          };

          // Tenant isolation check
          const targetOrgId = data.organizationId || "org-demo";
          if (targetOrgId !== loggedInOrgId) {
            toast.error(
              "Access denied. User profile not found in your organization.",
            );
            router.push("/dashboard/home");
            return;
          }

          setFullName(data.fullName || "");
          setRole(data.role || "Contributor");
          setPhone(data.phone ? formatPhone(data.phone) : "");
          setLocation(data.location ? String(data.location) : "");
          setDisplayName(
            data.displayName || (isSelf ? currentDisplayName : "") || "",
          );
          setEmail(data.email || "");
          setStatus(data.status || "Active");
        } else {
          // Default fallback if no doc exists yet
          if (readOnly) {
            setFullName("User Not Found");
            setRole("Contributor");
            setEmail("");
            setDisplayName("");
          } else {
            setFullName(isSelf ? currentDisplayName : "");
            setRole("Contributor");
            setDisplayName(isSelf ? currentDisplayName : "");
            setEmail(isSelf ? currentEmail : "");
          }
        }
      } catch (error) {
        console.error("Error fetching firestore profile:", error);
      } finally {
        setLoading(false);
      }
    }
    void loadData();
  }, [profileUid, currentUser, loggedInProfile, authLoading, router]);

  const handleSaveProfile = async (data: ProfileFormData) => {
    if (!currentUser) return;

    setSavingGeneral(true);
    try {
      const activeUid =
        profileUid && profileUid !== currentUser.uid
          ? profileUid
          : currentUser.uid;
      const isSelf = activeUid === currentUser.uid;

      // 1. Update Firebase Auth Profile (DisplayName) ONLY if editing self
      if (isSelf) {
        await updateProfile(currentUser, {
          displayName: data.displayName,
        });
      }

      // 2. Save additional metadata to Cloud Firestore users/{activeUid}
      const userDocRef = doc(db, "users", activeUid);
      await setDoc(userDocRef, buildProfileSavePayload(data, email), {
        merge: true,
      });

      // 3. Sync states
      setFullName(data.fullName);
      setDisplayName(data.displayName);
      setRole(data.role);
      setPhone(data.phone);
      setLocation(data.location);

      toast.success("Profile updated successfully!");
      setIsEditModalOpen(false);
    } catch (error) {
      console.error("Profile update error:", error);
      toast.error("Failed to update profile. Please try again.");
    } finally {
      setSavingGeneral(false);
    }
  };

  if (loading) return <LoadingState label="Loading Profile" />;

  const userInitials = getInitials(
    fullName || displayName || email || currentUser?.email || "U",
  );

  return (
    <>
      <PageTitle title="Profile" />
      <FadeIn className="mx-auto max-w-5xl space-y-6 pb-10">
        {/* Profile Premium Header Banner Card */}
        <Card className="relative flex flex-col items-center gap-6 p-6 md:flex-row">
          {/* Glow backdrop decorator */}
          <div className="pointer-events-none absolute top-0 right-0 -mt-20 -mr-20 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />

          <Avatar className="size-24 border-4 border-background shadow-md md:size-28">
            <AvatarFallback className="bg-primary font-semibold text-3xl text-primary-foreground">
              {userInitials}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1 space-y-2 text-center md:text-left">
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <h1 className="truncate font-bold text-3xl tracking-tight">
                {fullName || "User Profile"}
              </h1>
              {role && (
                <span className="inline-flex w-fit items-center gap-1 self-center rounded-full bg-primary/10 px-3 py-1 font-semibold text-primary text-xs md:self-auto">
                  <Sparkles className="size-3" />
                  {role}
                </span>
              )}
            </div>
            <p className="max-w-lg truncate text-muted-foreground text-sm">
              {email}
            </p>
          </div>
        </Card>

        <div className="mt-6 w-full">
          <Card className="py-0">
            <CardHeader className="border-b bg-muted/50 py-4">
              <CardTitle>Profile Details</CardTitle>
              <CardDescription>
                View or edit your profile information.
              </CardDescription>
              {(isSelf || (!isSelf && loggedInUserRole === "Admin")) && (
                <CardAction>
                  <TooltipDropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-9 cursor-pointer rounded-full"
                      >
                        <MoreVertical className="size-5" />
                        <span className="sr-only">Actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="mt-1 w-48">
                      <DropdownMenuItem
                        onClick={() => setIsEditModalOpen(true)}
                        className="flex cursor-pointer items-center gap-2"
                      >
                        <Edit className="size-4" />
                        Edit Profile
                      </DropdownMenuItem>

                      {!isSelf && loggedInUserRole === "Admin" && (
                        <DropdownMenuItem
                          onClick={handleResendInvite}
                          disabled={status !== "Pending" || isResending}
                          className={`flex items-center gap-2 ${
                            status === "Pending" && !isResending
                              ? "cursor-pointer"
                              : "cursor-not-allowed opacity-50"
                          }`}
                        >
                          <Mail className="size-4" />
                          {isResending ? "Resending..." : "Resend Invite"}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </TooltipDropdownMenu>
                </CardAction>
              )}
            </CardHeader>
            <CardContent className="space-y-6 p-6 md:p-8">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* Display Name */}
                <Field className="gap-1.5">
                  <FieldLabel htmlFor="profile-displayName">
                    Username / Display Name
                  </FieldLabel>
                  <div className="relative">
                    <Input
                      id="profile-displayName"
                      value={displayName}
                      disabled
                    />
                  </div>
                </Field>

                {/* Full Name */}
                <Field className="gap-1.5">
                  <FieldLabel htmlFor="profile-fullName">Full Name</FieldLabel>
                  <Input id="profile-fullName" value={fullName} disabled />
                </Field>

                {/* Role Selection Dropdown */}
                <Field className="gap-1.5">
                  <FieldLabel htmlFor="profile-role">User Role</FieldLabel>
                  <Select value={role} disabled>
                    <SelectTrigger id="profile-role" className="w-full">
                      <SelectValue placeholder="Select role..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Admin">Admin</SelectItem>
                      <SelectItem value="Contributor">Contributor</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                {/* Phone */}
                <Field className="gap-1.5">
                  <FieldLabel htmlFor="profile-phone">Contact Phone</FieldLabel>
                  <div className="relative flex items-center">
                    <Phone className="absolute left-3 size-4 text-muted-foreground" />
                    <Input
                      id="profile-phone"
                      className="pl-10"
                      value={phone}
                      disabled
                    />
                  </div>
                </Field>

                {/* Location */}
                <Field className="gap-1.5">
                  <FieldLabel htmlFor="profile-location">Location</FieldLabel>
                  <div className="relative flex items-center">
                    <MapPin className="absolute left-3 size-4 text-muted-foreground" />
                    <Input
                      id="profile-location"
                      className="pl-10"
                      value={location}
                      disabled
                    />
                  </div>
                </Field>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Edit Profile Modal */}
        <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
          <DialogContent className="sm:max-w-lg">
            <form onSubmit={profileForm.handleSubmit(handleSaveProfile)}>
              <DialogHeader className="mb-4">
                <DialogTitle>Edit Profile Details</DialogTitle>
                <DialogDescription>
                  Update your profile and contact information.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {/* Display Name */}
                <Controller
                  control={profileForm.control}
                  name="displayName"
                  render={({ field, fieldState }) => (
                    <Field
                      className="gap-1.5"
                      data-invalid={fieldState.invalid}
                    >
                      <FieldLabel htmlFor="modal-displayName">
                        Username / Display Name
                      </FieldLabel>
                      <Input
                        {...field}
                        id="modal-displayName"
                        aria-invalid={fieldState.invalid}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                {/* Full Name */}
                <Controller
                  control={profileForm.control}
                  name="fullName"
                  render={({ field, fieldState }) => (
                    <Field
                      className="gap-1.5"
                      data-invalid={fieldState.invalid}
                    >
                      <FieldLabel htmlFor="modal-fullName">
                        Full Name
                      </FieldLabel>
                      <Input
                        {...field}
                        id="modal-fullName"
                        aria-invalid={fieldState.invalid}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                {/* Role Selection Dropdown */}
                <Controller
                  control={profileForm.control}
                  name="role"
                  render={({ field, fieldState }) => (
                    <Field
                      className="gap-1.5"
                      data-invalid={fieldState.invalid}
                    >
                      <FieldLabel htmlFor="modal-role">User Role</FieldLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={isRoleDisabled}
                      >
                        <SelectTrigger
                          id="modal-role"
                          className="w-full"
                          aria-invalid={fieldState.invalid}
                        >
                          <SelectValue placeholder="Select role..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Admin">Admin</SelectItem>
                          <SelectItem value="Contributor">
                            Contributor
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                {/* Phone */}
                <Controller
                  control={profileForm.control}
                  name="phone"
                  render={({ field, fieldState }) => (
                    <Field
                      className="gap-1.5"
                      data-invalid={fieldState.invalid}
                    >
                      <FieldLabel htmlFor="modal-phone">
                        Contact Phone
                      </FieldLabel>
                      <div className="relative flex items-center">
                        <Phone className="absolute left-3 size-4 text-muted-foreground" />
                        <Input
                          {...field}
                          id="modal-phone"
                          className="pl-10"
                          aria-invalid={fieldState.invalid}
                          onChange={(e) =>
                            field.onChange(formatPhone(e.target.value))
                          }
                        />
                      </div>
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                {/* Location */}
                <Controller
                  control={profileForm.control}
                  name="location"
                  render={({ field, fieldState }) => (
                    <Field
                      className="gap-1.5"
                      data-invalid={fieldState.invalid}
                    >
                      <FieldLabel htmlFor="modal-location">Location</FieldLabel>
                      <div className="relative flex items-center">
                        <MapPin className="absolute left-3 size-4 text-muted-foreground" />
                        <Input
                          {...field}
                          id="modal-location"
                          className="pl-10"
                          placeholder="5-digit ZIP code"
                          aria-invalid={fieldState.invalid}
                          maxLength={5}
                          onChange={(e) => {
                            const clean = e.target.value
                              .replace(/\D/g, "")
                              .slice(0, 5);
                            field.onChange(clean);
                          }}
                        />
                      </div>
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              </div>

              <DialogFooter className="mt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={savingGeneral}
                  className="min-w-[120px]"
                >
                  {savingGeneral ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </FadeIn>
    </>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<LoadingState label="Loading Profile" />}>
      <ProfileContent />
    </Suspense>
  );
}
