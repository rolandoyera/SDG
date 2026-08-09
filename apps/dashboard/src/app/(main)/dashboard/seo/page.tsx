import { redirect } from "next/navigation";

// The SEO section has no landing page of its own — open the first tool.
export default function Page() {
  redirect("/dashboard/seo/position-tracking");
}
