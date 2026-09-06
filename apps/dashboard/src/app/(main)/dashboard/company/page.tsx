import { PageTitle } from "@/components/page-title-updater";

import { CompanyProfileForm } from "./_components/company-profile-form";

export default function Page() {
  return (
    <>
      <PageTitle title="Company Profile" />
      <CompanyProfileForm />
    </>
  );
}
