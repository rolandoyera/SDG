"use client";

import Image from "next/image";
import Link from "next/link";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import type { AppBrand } from "@/config/app-config";
import { cn } from "@/lib/utils";
import { sidebarItems } from "@/navigation/sidebar/sidebar-items";

import { NavMain } from "./nav-main";
import { TenantSwitcher } from "./tenant-switcher";

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  brand: AppBrand;
};

export function AppSidebar({ brand, ...props }: AppSidebarProps) {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const imageSize = isCollapsed ? 26 : 24;

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="group-data-[collapsible=icon]:p-0.5!"
            >
              <Link prefetch={false} href="/dashboard/home">
                <Image
                  src={brand.image.iconSrc}
                  alt={`${brand.name} logo`}
                  width={imageSize}
                  height={imageSize}
                  style={{
                    width: imageSize,
                    height: imageSize,
                  }}
                  className={cn(
                    "transition-all duration-200 dark:hidden",
                    brand.image.invertOnDark && "dark:invert",
                  )}
                />
                <Image
                  src={brand.image.iconDarkSrc}
                  alt={`${brand.name} logo`}
                  width={imageSize}
                  height={imageSize}
                  style={{
                    width: imageSize,
                    height: imageSize,
                  }}
                  className={cn(
                    "hidden transition-all duration-200 dark:block",
                    brand.image.invertOnDark && "dark:invert",
                  )}
                />
                <span className="font-semibold font-lora text-2xl text-black dark:text-white">
                  {brand.shortName}
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={sidebarItems} />
      </SidebarContent>
      <SidebarFooter>
        <TenantSwitcher />
      </SidebarFooter>
    </Sidebar>
  );
}
