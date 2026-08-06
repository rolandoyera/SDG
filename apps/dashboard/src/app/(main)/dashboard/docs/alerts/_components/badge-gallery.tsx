import { Badge } from "@/components/ui/badge";

/** One labelled swatch: the rendered element above its source/usage note. */
function Swatch({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-2 rounded border bg-card p-4">
      <div className="flex min-h-6 items-center">{children}</div>
      <code className="text-[11px] text-muted-foreground">{label}</code>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-medium text-sm">{title}</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{children}</div>
    </div>
  );
}

/**
 * Gallery of every sanctioned `Badge` variant, so the standard set can be
 * reviewed in one place.
 */
export function BadgeGallery() {
  return (
    <div className="flex flex-col gap-8">
      <Section title="Variants">
        <Swatch label='variant="default"'>
          <Badge>Default</Badge>
        </Swatch>
        <Swatch label='variant="secondary"'>
          <Badge variant="secondary">Secondary</Badge>
        </Swatch>
        <Swatch label='variant="outline"'>
          <Badge variant="outline">Outline</Badge>
        </Swatch>
        <Swatch label='variant="ghost"'>
          <Badge variant="ghost">Ghost</Badge>
        </Swatch>
        <Swatch label='variant="destructive"'>
          <Badge variant="destructive">Destructive</Badge>
        </Swatch>
        <Swatch label='variant="success"'>
          <Badge variant="success">Success</Badge>
        </Swatch>
        <Swatch label='variant="trendingUp"'>
          <Badge variant="trendingUp">Trending Up</Badge>
        </Swatch>
        <Swatch label='variant="trendingDown"'>
          <Badge variant="trendingDown">Trending Down</Badge>
        </Swatch>
        <Swatch label='variant="warning"'>
          <Badge variant="warning">Warning</Badge>
        </Swatch>
        <Swatch label='variant="info"'>
          <Badge variant="info">Info</Badge>
        </Swatch>
        <Swatch label='variant="link"'>
          <Badge variant="link">Link</Badge>
        </Swatch>
        <Swatch label='variant="overlay"'>
          <Badge variant="overlay">Overlay</Badge>
        </Swatch>
      </Section>
    </div>
  );
}
