import PageHeader from "@/components/page-header";
import { PageTitle } from "@/components/page-title-updater";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getMetaConnection, getMetaPendingPages } from "@/server/meta-actions";

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

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; meta?: string }>;
}) {
  const { range = "last-30-days", meta: metaParam } = await searchParams;
  const meta = await getMetaConnection();
  // Only hit the Graph API for the picker when we arrived from a multi-page
  // grant (?meta=select) — keeps normal page loads cheap.
  const pendingPages =
    metaParam === "select" ? await getMetaPendingPages() : [];

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Instagram" />
      <div className="flex items-center justify-between">
        <PageHeader
          title="Instagram"
          description="How clients discover and interact with your brand on Instagram."
          titleAccessory={
            <span
              role="img"
              className="relative flex size-2.5"
              title={meta ? "Connected" : "Not connected"}
              aria-label={meta ? "Connected" : "Not connected"}
            >
              <span
                className={`absolute inline-flex size-full animate-ping rounded-full opacity-75 ${
                  meta ? "bg-green-500" : "bg-red-500"
                }`}
              />
              <span
                className={`relative inline-flex size-2.5 rounded-full ${meta ? "bg-green-500" : "bg-red-500"}`}
              />
            </span>
          }
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
    </div>
  );
}
