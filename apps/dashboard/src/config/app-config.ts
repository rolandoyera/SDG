import packageJson from "../../package.json";

export interface AppBrand {
  name: string;
  shortName: string;
  tagline: string;
  meta: {
    title: string;
    description: string;
  };
  image: {
    src: string;
    darkSrc: string;
    iconSrc: string;
    iconDarkSrc: string;
    invertOnDark?: boolean;
  };
}

const defaultBrand: AppBrand = {
  name: "Lenis Studio",
  shortName: "Lenis Studio",
  tagline: "Design. Build. Repeat.",
  meta: {
    title: "Lenis Studio",
    description:
      "Lenis Studio is a modern dashboard built by creatives for creatives. Sorry, accountants.",
  },
  image: {
    src: "/badge.svg",
    darkSrc: "/badge.svg",
    iconSrc: "/badge.svg",
    iconDarkSrc: "/badge.svg",
    invertOnDark: true,
  },
};

const sarvianBrand: AppBrand = {
  name: "Sarvian Design Group",
  shortName: "Sarvian Studio",
  tagline: "Design. Build. Repeat.",
  meta: {
    title: "Sarvian Design Group",
    description: "Sarvian Design Group dashboard.",
  },
  image: {
    src: "/brands/app.sarviandg.com/logo-dark.svg",
    darkSrc: "/brands/app.sarviandg.com/logo-light.svg",
    iconSrc: "/brands/app.sarviandg.com/icon-dark.svg",
    iconDarkSrc: "/brands/app.sarviandg.com/icon-light.svg",
  },
};

export const APP_CONFIG = {
  version: packageJson.version,
  brand: defaultBrand,
  hostBrands: {
    "studio.sarviandg.com": sarvianBrand,
    "app.sarviandg.local": sarvianBrand,
  },
  // White-label domains are tenant-exclusive: only members of the mapped org
  // (and SuperAdmins) may sign in there. Hosts not listed (the default Lenis
  // domain, localhost) accept members of any org.
  hostOrgs: {
    "studio.sarviandg.com": "org-sarvian",
    "app.sarviandg.local": "org-sarvian",
  },
} satisfies {
  version: string;
  brand: AppBrand;
  hostBrands: Record<string, AppBrand>;
  hostOrgs: Record<string, string>;
};

/**
 * Orgs exempt from per-tenant usage caps, by home organization.
 *
 * `org-demo` is the sales sandbox used to demo the product to prospects — a
 * "monthly limit reached" wall mid-demo is the worst possible time to hit one.
 * Add the platform owner's own org here once it exists; until then operators
 * are covered by the SuperAdmin exemption in `checkAutofillQuota`.
 */
export const UNCAPPED_ORG_IDS: ReadonlySet<string> = new Set(["org-demo"]);

export function resolveAppBrand(host?: string | null): AppBrand {
  const normalizedHost = host?.split(":")[0]?.toLowerCase();
  const hostBrands: Record<string, AppBrand> = APP_CONFIG.hostBrands;

  if (normalizedHost && hostBrands[normalizedHost]) {
    return hostBrands[normalizedHost];
  }

  return APP_CONFIG.brand;
}

/** The org a white-label host is reserved for, or null when the host is open. */
export function resolveHostOrg(host?: string | null): string | null {
  const normalizedHost = host?.split(":")[0]?.toLowerCase();
  const hostOrgs: Record<string, string> = APP_CONFIG.hostOrgs;
  return (normalizedHost && hostOrgs[normalizedHost]) || null;
}
