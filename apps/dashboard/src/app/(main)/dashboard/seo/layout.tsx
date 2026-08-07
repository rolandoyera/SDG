import { SeoSidebarNav } from "./_components/seo-sidebar-nav";

export default function SeoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative w-full p-6">
      <aside className="absolute inset-y-6 left-6 hidden w-48 md:block">
        <div className="sticky top-6">
          <SeoSidebarNav />
        </div>
      </aside>
      <main className="mx-auto w-full max-w-330">{children}</main>
    </div>
  );
}
