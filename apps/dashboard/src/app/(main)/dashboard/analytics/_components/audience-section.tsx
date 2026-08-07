import { GeoTable } from "@/components/charts/geo-table";
import { HatchBarChart } from "@/components/charts/hatch-bar-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchAudienceData } from "@/server/analytics-actions";

import { AnalyticsSetupRequired } from "./analytics-setup-required";
import { Label } from "@/components/ui/label";

const DEVICE_LABELS: Record<string, string> = {
  desktop: "Desktop",
  mobile: "Mobile",
  tablet: "Tablet",
  smarttv: "Smart TV",
};

const VISITOR_TYPE_LABELS: Record<string, string> = {
  new: "New",
  returning: "Returning",
};

export async function AudienceSection({ range }: { range?: string }) {
  const result = await fetchAudienceData(range);

  if (!result.success || !result.data) {
    return (
      <div className="rounded bg-card shadow-xs ring-1 ring-foreground/5">
        <AnalyticsSetupRequired
          error={result.error}
          title="Audience Error"
          className="min-h-50"
        />
      </div>
    );
  }

  const { cities, countries, devices, newVsReturning } = result.data;

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-12">
      <Card className="col-span-1 lg:col-span-6 pt-0">
        <CardHeader className="bg-muted/50 py-3.5">
          <CardTitle className="font-normal">Devices</CardTitle>
        </CardHeader>
        <CardContent>
          <Label className="ml-auto w-fit mb-4 -mt-4 text-card-foreground">
            Visitors
          </Label>
          <HatchBarChart
            seriesLabel="Users"
            showPercentage
            data={devices.map((device) => ({
              barText: DEVICE_LABELS[device.device] || device.device,
              value: device.users,
              valueLabel: String(device.users),
            }))}
          />
        </CardContent>
      </Card>

      <Card className="col-span-1 lg:col-span-6 pt-0">
        <CardHeader className="bg-muted/50 py-3.5">
          <CardTitle className="font-normal">New vs Returning</CardTitle>
        </CardHeader>
        <CardContent>
          <Label className="ml-auto w-fit mb-4 -mt-4 text-card-foreground">
            Visitors
          </Label>
          <HatchBarChart
            seriesLabel="Users"
            showPercentage
            data={newVsReturning.map((entry) => ({
              barText: VISITOR_TYPE_LABELS[entry.type] || entry.type,
              value: entry.users,
              valueLabel: String(entry.users),
            }))}
          />
        </CardContent>
      </Card>

      <Card className="md:col-span-1 lg:col-span-6 pt-0">
        <CardHeader className="bg-muted/50 py-3.5">
          <CardTitle className="font-normal">Top Cities</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col">
          <GeoTable
            labelHeader="City"
            rows={cities.map((city) => ({
              label: city.city,
              value: city.users,
              flagCode: city.countryId || undefined,
            }))}
          />
        </CardContent>
      </Card>
      <Card className="md:col-span-1 lg:col-span-6 pt-0">
        <CardHeader className="bg-muted/50 py-3.5">
          <CardTitle className="font-normal">Top Countries</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col">
          <GeoTable
            labelHeader="Country"
            rows={countries.map((country) => ({
              label: country.country,
              value: country.users,
              flagCode: country.countryId || undefined,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
