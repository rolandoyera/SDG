import { PageTitle } from "@/components/page-title-updater";
import { H1, P } from "@/components/ui/typography";

import { UserGreeting } from "../_components/user-greeting";
import { WeatherWidget } from "../_components/weather-widget";
import { MetricCards } from "./_components/metric-cards";
import { NotificationsCard } from "./_components/notifications-card";
import { PerformanceOverview } from "./_components/performance-overview";
import { SubscriberOverview } from "./_components/subscriber-overview";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Page() {
  return (
    <>
      <PageTitle title="Home" />
      <div className="@container/main flex flex-col gap-4 md:gap-6">
        <div className="flex items-start justify-start gap-4">
          <div className="mb-6 flex flex-col gap-1">
            <H1 className="flex items-center gap-3">
              <UserGreeting prefix="Hello" />
            </H1>
            <P>Here's what's happening in the studio today.</P>
          </div>
          <WeatherWidget />
        </div>
        <MetricCards />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
          <div className="md:col-span-6 xl:col-span-3">
            <NotificationsCard />
          </div>
          <div className="md:col-span-6 xl:col-span-3">
            <Card variant="panel" className="h-full">
              <CardHeader>
                <CardTitle>Tasks</CardTitle>
              </CardHeader>
              <CardContent className="pt-0"></CardContent>
            </Card>
          </div>
          <div className="md:col-span-12 xl:col-span-6">
            <PerformanceOverview />
          </div>
          <div className="md:col-span-12 xl:col-span-12">
            <SubscriberOverview />
          </div>
        </div>
      </div>
    </>
  );
}
