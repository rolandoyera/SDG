import { SeoSidebarNav } from "./_components/seo-sidebar-nav";

export default function SeoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full gap-6 p-6">
      <aside className="hidden w-48 shrink-0 md:block">
        <div className="sticky top-6">
          <SeoSidebarNav />
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
