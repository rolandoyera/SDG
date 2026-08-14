import { UserPlus } from "lucide-react";

import { InstagramIcon } from "@/components/icons/icons";

import { Label } from "@/components/ui/label";
import {
  fetchInstagramFollowers,
  fetchInstagramHeadline,
} from "@/server/meta-actions";
import {
  Display,
  DisplayContent,
  DisplayHeader,
  DisplayIcon,
  DisplayTitle,
} from "@/components/ui/display";

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
  ];

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
      <Display>
        <DisplayHeader>
          <DisplayIcon>
            <InstagramIcon size={20} strokeWidth={1.5} />
          </DisplayIcon>
          <DisplayTitle>Followers</DisplayTitle>
        </DisplayHeader>
        <DisplayContent className="flex flex-col items-center gap-2 pt-1">
          <p className="font-medium text-3xl leading-none tracking-tight tabular-nums">
            {followers.toLocaleString()}
          </p>
          <Label>Current Count</Label>
        </DisplayContent>
      </Display>

      {cards.map((card) => (
        <Display key={card.label}>
          <DisplayHeader>
            <DisplayIcon>{card.icon}</DisplayIcon>
            <DisplayTitle>{card.label}</DisplayTitle>
          </DisplayHeader>
          <DisplayContent className="flex flex-col items-center gap-2 pt-1">
            <p className="font-medium text-3xl leading-none tracking-tight tabular-nums">
              {card.value}
            </p>
            <Label>Past 30 days</Label>
          </DisplayContent>
        </Display>
      ))}
    </div>
  );
}
