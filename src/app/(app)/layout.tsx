"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { ModeToggle } from "@/components/mode-toggle";
import { useDevUser } from "@/components/dev-user-provider";
import { canAccess } from "@/lib/permissions";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

const BREADCRUMBS: Record<string, string[]> = {
  "/": ["Нүүр"],
  "/customers": ["Лавлагаа", "Захиалагч"],
  "/suppliers": ["Лавлагаа", "Нийлүүлэгч"],
  "/materials": ["Лавлагаа", "Түүхий эд"],
  "/products": ["Лавлагаа", "Хоол"],
  "/warehouse/receipts": ["Агуулах", "Бараа хүлээн авах"],
};

function AccessDenied({ roleLabel }: { roleLabel: string }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="max-w-md rounded-lg border p-6 text-center">
        <p className="text-lg font-medium">Хандах эрхгүй</p>
        <p className="text-muted-foreground mt-2 text-sm">
          Таны одоогийн дүр (<span className="font-medium">{roleLabel}</span>)
          энэ хуудсанд хандах эрхгүй. Sidebar-ын дээд хэсгээс хэрэглэгчээ сольж
          үзнэ үү.
        </p>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useDevUser();
  // Динамик дэд хуудсанд ("/warehouse/receipts/[id]") эцэг замын
  // breadcrumb дээр "Дэлгэрэнгүй" нэмж харуулна
  const parentKey = Object.keys(BREADCRUMBS)
    .filter((k) => k !== "/" && pathname.startsWith(k + "/"))
    .sort((a, b) => b.length - a.length)[0];
  const crumbs =
    BREADCRUMBS[pathname] ??
    (parentKey ? [...BREADCRUMBS[parentKey], "Дэлгэрэнгүй"] : ["Нүүр"]);
  const allowed = canAccess(user.role, pathname);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-vertical:h-4 data-vertical:self-auto"
            />
            <Breadcrumb>
              <BreadcrumbList>
                {crumbs.map((crumb, i) => (
                  <React.Fragment key={crumb}>
                    {i > 0 && (
                      <BreadcrumbSeparator className="hidden md:block" />
                    )}
                    <BreadcrumbItem>
                      {i === crumbs.length - 1 ? (
                        <BreadcrumbPage>{crumb}</BreadcrumbPage>
                      ) : (
                        <span className="hidden md:block">{crumb}</span>
                      )}
                    </BreadcrumbItem>
                  </React.Fragment>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div className="ml-auto px-4">
            <ModeToggle />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          {allowed ? children : <AccessDenied roleLabel={user.roleLabel} />}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
