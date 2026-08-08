import { LEGAL_UPDATED } from "@/lib/site";

export function LegalPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="py-12">
      <h1 className="text-3xl font-semibold tracking-tight text-neutral-50">
        {title}
      </h1>
      <p className="mt-2 text-sm text-neutral-500">
        Last updated: {LEGAL_UPDATED}
      </p>
      <div className="mt-8 space-y-8">{children}</div>
    </article>
  );
}

export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium text-neutral-100">{heading}</h2>
      <div className="space-y-3 leading-relaxed text-neutral-400 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
        {children}
      </div>
    </section>
  );
}
