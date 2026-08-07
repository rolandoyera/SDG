"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth-context";
import { DashboardImage } from "@/components/dashboard-image";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getWeatherForLocation } from "@/server/weather-actions";

interface WeatherData {
  location: {
    name: string;
    region: string;
    country: string;
  };
  current: {
    temp_f: number;
    temp_c: number;
    is_day: number;
    condition: {
      text: string;
      icon: string;
    };
  };
}

/**
 * Client-Side Weather Widget: Fetches the user's Firestore ZIP code,
 * executes the secure server weather action, and displays the real-time temperature,
 * condition condition icon, and city. Fail-safe: hides completely if key/API is down.
 */
export function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);

  const { profile, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;

    const loadWeather = async () => {
      try {
        let userLocation = "10001"; // Fallback default zip (New York)
        if (profile?.location && profile.location.trim() !== "") {
          userLocation = profile.location.trim();
        }

        // Query secure Server Action for current weather
        const res = await getWeatherForLocation(userLocation);
        if (res.success && res.data) {
          setWeather(res.data);
        } else {
          // Stay silent for the user — just log and render nothing.
          console.warn("[WeatherWidget] Weather unavailable:", res.error);
        }
      } catch (err: unknown) {
        console.error("[WeatherWidget] Error loading weather details:", err);
      } finally {
        setLoading(false);
      }
    };

    void loadWeather();
    // Keyed on the location value only: loads once on page hit and re-fetches just
    // when the user's location changes, not on every profile/lastActive heartbeat.
  }, [profile?.location, authLoading]);

  if (loading) {
    return (
      <div className="flex h-11 w-44 items-center gap-2.5 rounded border border-border/40 bg-card/45 px-3 py-1.5 shadow-xs backdrop-blur-xs">
        <Skeleton className="size-7.5 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-2 w-20" />
        </div>
      </div>
    );
  }

  // Gracefully fail-safe: render nothing if the weather couldn't be fetched.
  if (!weather) {
    return null;
  }

  // Prefix protocol to weatherapi cdn links if needed
  const iconUrl = weather.current.condition.icon.startsWith("//")
    ? `https:${weather.current.condition.icon}`
    : weather.current.condition.icon;

  const temp = Math.round(weather.current.temp_f);
  const isDay = weather.current.is_day;
  let conditionText = weather.current.condition.text;
  if (isDay === 0 && conditionText.toLowerCase() === "sunny") {
    conditionText = "Clear";
  }
  const cityName = weather.location.name;

  return (
    <div
      title={`Current weather in ${cityName}: ${conditionText}`}
      className="flex shrink-0 select-none items-center px-3 font-normal text-card-foreground text-sm normal-case tracking-normal mt-1"
    >
      <div className="relative size-14 shrink-0">
        <DashboardImage
          src={iconUrl}
          alt={conditionText}
          sizes="56px"
          className="object-contain drop-shadow-xs"
          draggable={false}
        />
      </div>
      <div className="flex min-w-0 flex-col text-left leading-normal">
        <div className="flex flex-col items-baseline mb-1">
          <span className="text-2xl text-foreground leading-none">
            {temp}°F
          </span>
          <span className="font-light text-muted-foreground text-xs leading-none">
            {conditionText}
          </span>
        </div>
        <Label className="mt-0.5 text-xs">{cityName}</Label>
      </div>
    </div>
  );
}
