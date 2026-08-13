"use client"

import * as React from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  CheckIcon,
  ChevronsUpDownIcon,
  ClipboardListIcon,
  FlameIcon,
  PackageIcon,
  SaladIcon,
  TruckIcon,
  WarehouseIcon,
} from "lucide-react"

import { DEV_USERS, type DevUser } from "@/lib/dev-users"
import { useDevUser } from "@/components/dev-user-provider"

const USER_ICONS: Record<string, React.ReactNode> = {
  manager: <ClipboardListIcon className="size-4" />,
  storekeeper: <WarehouseIcon className="size-4" />,
  "station-prep": <SaladIcon className="size-4" />,
  "station-hot": <FlameIcon className="size-4" />,
  "station-packaging": <PackageIcon className="size-4" />,
  delivery: <TruckIcon className="size-4" />,
}

export function UserSwitcher() {
  const { isMobile } = useSidebar()
  const { user, setUser } = useDevUser()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
              />
            }
          >
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              {USER_ICONS[user.id]}
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs">{user.roleLabel}</span>
            </div>
            <ChevronsUpDownIcon className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-fit min-w-56"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Хэрэглэгч солих (тест горим)
              </DropdownMenuLabel>
              {DEV_USERS.map((u: DevUser) => (
                <DropdownMenuItem
                  key={u.id}
                  onClick={() => setUser(u)}
                  className="gap-2 p-2"
                >
                  <div className="flex size-6 items-center justify-center rounded-md border">
                    {USER_ICONS[u.id]}
                  </div>
                  <div className="grid flex-1 text-left leading-tight">
                    <span className="truncate">{u.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {u.roleLabel}
                    </span>
                  </div>
                  {u.id === user.id && <CheckIcon className="size-4" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Auth идэвхжсэний дараа энэ солигч хасагдана
              </DropdownMenuLabel>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
