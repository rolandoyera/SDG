import { Eye, Heart, MessageCircle, UserPlus } from "lucide-react";

import { InstagramIcon } from "@/components/icons/icons";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  fetchInstagramFollowers,
  fetchInstagramHeadline,
} from "@/server/meta-actions";

export async function InstagramHeadlineCards({
  followersCount,
}: {
  followersCount: number;
}) {
  const [result, followersResult] = await Promise.all([
    fetchInstagramHeadline(),
    fetchInstagramFollowers(),
  ]);
  const data = result.success ? result.data : undefined;
  // Prefer the live follower total; fall back to the stored snapshot if the live call fails.
  const followers = followersResult.success
    ? (followersResult.data?.followers ?? followersCount)
    : followersCount;
  const fmt = (val: number | null | undefined) =>
    val == null ? "—" : val.toLocaleString();

  const cards = [
    {
      icon: <UserPlus className="size-4" />,
      label: "New Followers",
      value: fmt(data?.newFollowers),
    },
    {
      icon: <Heart className="size-4" />,
      label: "Likes",
      value: fmt(data?.likes),
    },
    {
      icon: <MessageCircle className="size-4" />,
      label: "New Comments",
      value: fmt(data?.comments),
    },
    {
      icon: <Eye className="size-4" />,
      label: "Profile Visits",
      value: fmt(data?.profileViews),
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs xl:grid-cols-5 dark:*:data-[slot=card]:bg-card">
      <Card>
        <CardHeader className="flex items-center gap-4">
          <CardTitle>
            <div className="flex size-7 items-center justify-center rounded bg-muted text-muted-foreground">
              <InstagramIcon size={20} strokeWidth={1.5} />
            </div>
          </CardTitle>
          <CardDescription>Followers</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-2 pt-1">
          <p className="font-medium text-3xl leading-none tracking-tight tabular-nums">
            {followers.toLocaleString()}
          </p>
          <Label>Current Count</Label>
        </CardContent>
      </Card>

      {cards.map((card) => (
        <Card key={card.label}>
          <CardHeader className="flex items-center gap-4">
            <CardTitle>
              <div className="flex size-7 items-center justify-center rounded bg-muted text-muted-foreground">
                {card.icon}
              </div>
            </CardTitle>
            <CardDescription>{card.label}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-2 pt-1">
            <p className="font-medium text-3xl leading-none tracking-tight tabular-nums">
              {card.value}
            </p>
            <Label>Past 30 days</Label>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
