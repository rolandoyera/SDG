import { cache, Suspense } from "react";

import {
  ConnectionDot,
  ConnectionDotPending,
} from "@/components/connection-dot";
import { FadeIn } from "@/components/fade-in";
import { LoadingState } from "@/components/loading-state";
import PageHeader from "@/components/page-header";
import { PageTitle } from "@/components/page-title-updater";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getMetaConnection, getMetaPendingPages } from "@/server/meta-actions";
import type { MetaIntegrationConfig } from "@/types/meta";

import { InstagramConnect } from "./_components/instagram-connect";
import { InstagramDemographics } from "./_components/instagram-demographics";
import { InstagramFollowerTrend } from "./_components/instagram-follower-trend";
import { InstagramHeadlineCards } from "./_components/instagram-headline-cards";
import { InstagramKpiStrip } from "./_components/instagram-kpi-strip";
import { InstagramReachTrend } from "./_components/instagram-reach-trend";
import { InstagramRecentPosts } from "./_components/instagram-recent-posts";
import { InstagramPostsGrid } from "./_components/instagram-posts-grid";
import { InstagramTabs } from "./_components/instagram-tabs";
import { InstagramToolbar } from "./_components/instagram-toolbar";

// The header (dot + avatar) and the body both need the connection; dedupe to
// one Firestore read per request.
const getConnection = cache(getMetaConnection);

function HeaderRow({
  dot,
  meta,
}: {
  dot: React.ReactNode;
  meta: MetaIntegrationConfig | null;
}) {
  return (
    <div className="flex items-center justify-between">
      <PageHeader
        title="Instagram"
        description="How clients discover and interact with your brand on Instagram."
        titleAccessory={dot}
      />
      {meta && (
        <div className="flex flex-col items-center gap-2">
          <Avatar className="size-9">
            <AvatarImage
              src={meta.instagramProfilePictureUrl}
              alt={meta.instagramUsername}
            />
            <AvatarFallback>
              {meta.instagramUsername.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium text-card-foreground text-sm">
            @{meta.instagramUsername}
          </span>
        </div>
      )}
    </div>
  );
}

async function InstagramHeader() {
  const meta = await getConnection();
  return (
    <HeaderRow dot={<ConnectionDot connected={meta !== null} />} meta={meta} />
  );
}

async function InstagramContent({
  range,
  metaParam,
}: {
  range: string;
  metaParam?: string;
}) {
  const meta = await getConnection();
  // Only hit the Graph API for the picker when we arrived from a multi-page
  // grant (?meta=select) — keeps normal page loads cheap.
  const pendingPages =
    metaParam === "select" ? await getMetaPendingPages() : [];

  return (
    <FadeIn className="flex flex-col gap-6">
      {meta && (
        <InstagramTabs
          overview={
            <>
              <InstagramHeadlineCards followersCount={meta.followersCount} />

              <div className="flex justify-end">
                <InstagramToolbar />
              </div>

              <InstagramKpiStrip range={range} />

              <div className="grid gap-6 lg:grid-cols-2">
                <InstagramReachTrend range={range} />
                <InstagramFollowerTrend range={range} />
              </div>
              <InstagramRecentPosts />
            </>
          }
          posts={<InstagramPostsGrid />}
          audience={<InstagramDemographics />}
        />
      )}

      <InstagramConnect
        connection={meta}
        pendingPages={pendingPages}
        justConnected={metaParam === "connected"}
      />
    </FadeIn>
  );
}

// Nothing above the Suspense boundaries awaits Firestore or the Graph API, so
// the page shell streams immediately on navigation. The header resolves as
// soon as the connection doc is read; the body sits inside ONE boundary so a
// single spinner shows until the slowest Graph call resolves, then everything
// reveals together with a fade-in. Awaiting a fetch at this level would hold
// the previous route on screen until it finished.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; meta?: string }>;
}) {
  const { range = "last-30-days", meta: metaParam } = await searchParams;

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Instagram" />
      <Suspense
        fallback={<HeaderRow dot={<ConnectionDotPending />} meta={null} />}
      >
        <InstagramHeader />
      </Suspense>

      <Suspense fallback={<LoadingState label="Instagram" />}>
        <InstagramContent range={range} metaParam={metaParam} />
      </Suspense>
    </div>
  );
}
