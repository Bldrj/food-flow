"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { NavUser } from "@/components/nav-user";
import { UserSwitcher } from "@/components/user-switcher";
import { useDevUser } from "@/components/dev-user-provider";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  BookOpenIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  FactoryIcon,
  HomeIcon,
  WarehouseIcon,
} from "lucide-react";
import { canAccess } from "@/lib/permissions";

// Лавлагаа (master data) дэд цэсүүд — шинэ лавлах нэмэгдэхэд энд мөр нэмнэ
const MASTER_DATA_ITEMS = [
  { title: "Захиалагч", url: "/customers" },
  { title: "Нийлүүлэгч", url: "/suppliers" },
  { title: "Түүхий эд", url: "/materials" },
  { title: "Хоол", url: "/products" },
  { title: "Технологийн карт", url: "/tech-cards" },
];

// Агуулах (transaction) дэд цэсүүд
const WAREHOUSE_ITEMS = [
  { title: "Үлдэгдэл", url: "/warehouse" },
  { title: "Бараа хүлээн авах", url: "/warehouse/receipts" },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useDevUser();
  const pathname = usePathname();

  // Дүрд нь хандах эрхгүй цэсийг харуулахгүй
  const masterDataItems = MASTER_DATA_ITEMS.filter((item) =>
    canAccess(user.role, item.url),
  );
  const warehouseItems = WAREHOUSE_ITEMS.filter((item) =>
    canAccess(user.role, item.url),
  );

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <UserSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Цэс</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Нүүр"
                isActive={pathname === "/"}
                render={<Link href="/" />}
              >
                <HomeIcon />
                <span>Нүүр</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {masterDataItems.length > 0 && (
              <Collapsible
                defaultOpen
                className="group/collapsible"
                render={<SidebarMenuItem />}
              >
                <CollapsibleTrigger
                  render={<SidebarMenuButton tooltip="Лавлагаа" />}
                >
                  <BookOpenIcon />
                  <span>Лавлагаа</span>
                  <ChevronRightIcon className="ml-auto transition-transform duration-200 group-data-open/collapsible:rotate-90" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {masterDataItems.map((item) => (
                      <SidebarMenuSubItem key={item.url}>
                        <SidebarMenuSubButton
                          isActive={pathname === item.url}
                          render={<Link href={item.url} />}
                        >
                          <span>{item.title}</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </Collapsible>
            )}
            {canAccess(user.role, "/orders") && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Захиалга"
                  isActive={pathname.startsWith("/orders")}
                  render={<Link href="/orders" />}
                >
                  <ClipboardListIcon />
                  <span>Захиалга</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
            {canAccess(user.role, "/production") && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Үйлдвэрлэл"
                  isActive={pathname.startsWith("/production")}
                  render={<Link href="/production" />}
                >
                  <FactoryIcon />
                  <span>Үйлдвэрлэл</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
            {warehouseItems.length > 0 && (
              <Collapsible
                defaultOpen
                className="group/collapsible"
                render={<SidebarMenuItem />}
              >
                <CollapsibleTrigger
                  render={<SidebarMenuButton tooltip="Агуулах" />}
                >
                  <WarehouseIcon />
                  <span>Агуулах</span>
                  <ChevronRightIcon className="ml-auto transition-transform duration-200 group-data-open/collapsible:rotate-90" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {warehouseItems.map((item) => (
                      <SidebarMenuSubItem key={item.url}>
                        <SidebarMenuSubButton
                          isActive={pathname === item.url}
                          render={<Link href={item.url} />}
                        >
                          <span>{item.title}</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </Collapsible>
            )}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavUser
          user={{ name: user.name, email: user.roleLabel, avatar: "" }}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
