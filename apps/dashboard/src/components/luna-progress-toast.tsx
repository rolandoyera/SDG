"use client";

import { toast } from "sonner";

import LunaMoon from "@/components/LunaMoon";
import { AI_ASSISTANT_NAME } from "@/lib/ai-assistant";
import { cn } from "@/lib/utils";

type LunaProgressStage = {
  label: string;
  detail: string;
};

const PRODUCT_AUTOFILL_STAGES: LunaProgressStage[] = [
  {
    label: "Reading the product page",
    detail: `${AI_ASSISTANT_NAME} is gathering the source text, specs, pricing, and product imagery.`,
  },
  {
    label: "Finding the product signals",
    detail: `${AI_ASSISTANT_NAME} is separating dimensions, materials, finishes, vendor data, and pricing clues.`,
  },
  {
    label: "Shaping the catalog fields",
    detail: `${AI_ASSISTANT_NAME} is matching what she found to this library form.`,
  },
  {
    label: "Checking the extraction",
    detail: `${AI_ASSISTANT_NAME} is reviewing confidence before filling the fields.`,
  },
];

type LunaProgressToastProps = {
  stages: LunaProgressStage[];
  activeStage: number;
  statusLabel?: string;
  statusDetail?: string;
};

function LunaProgressToast({
  stages,
  activeStage,
  statusLabel,
  statusDetail,
}: LunaProgressToastProps) {
  const safeStage =
    stages[Math.min(activeStage, stages.length - 1)] ?? stages[0];
  const label = statusLabel ?? safeStage.label;
  const detail = statusDetail ?? safeStage.detail;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="truncate font-medium text-sm">
          {AI_ASSISTANT_NAME} is working
        </p>
        <p className="text-foreground text-sm">{label}</p>
        <p className="max-w-[18rem] text-muted-foreground text-xs leading-snug">
          {detail}
        </p>
      </div>

      <div className="flex items-center gap-1.5" aria-hidden="true">
        {stages.map((stage, index) => (
          <span
            key={stage.label}
            className={cn(
              "h-1.5 flex-1 rounded-full bg-muted transition-colors",
              index <= activeStage && "bg-foreground/70",
            )}
          />
        ))}
      </div>
    </div>
  );
}

function lunaToastIcon() {
  return (
    <LunaMoon thinking variant="orbit" size={18} className="text-foreground" />
  );
}

function updateLunaProgressToast(
  toastId: string | number,
  activeStage: number,
  status?: { label?: string; detail?: string },
) {
  toast(
    <LunaProgressToast
      stages={PRODUCT_AUTOFILL_STAGES}
      activeStage={activeStage}
      statusLabel={status?.label}
      statusDetail={status?.detail}
    />,
    {
      id: toastId,
      duration: Infinity,
      icon: lunaToastIcon(),
    },
  );
}

export function startLunaProductAutofillToast() {
  let activeStage = 0;
  const toastId = toast(
    <LunaProgressToast
      stages={PRODUCT_AUTOFILL_STAGES}
      activeStage={activeStage}
    />,
    {
      duration: Infinity,
      icon: lunaToastIcon(),
    },
  );

  const intervalId = window.setInterval(() => {
    activeStage = Math.min(activeStage + 1, PRODUCT_AUTOFILL_STAGES.length - 1);
    updateLunaProgressToast(toastId, activeStage);
  }, 2600);

  return {
    id: toastId,
    showRetry(attempt: number, maxAttempts: number) {
      window.clearInterval(intervalId);
      updateLunaProgressToast(toastId, PRODUCT_AUTOFILL_STAGES.length - 1, {
        label: `${AI_ASSISTANT_NAME} found a busy AI server - retrying ${attempt}/${maxAttempts}`,
        detail:
          "She is keeping the scraped page context and asking again after a short pause.",
      });
    },
    stop() {
      window.clearInterval(intervalId);
    },
  };
}
