"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { MoonIcon, SunIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function ModeToggle() {
  const { setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="relative" />}>
        <SunIcon className="size-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
        <MoonIcon className="absolute size-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
        <span className="sr-only">Горим солих</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-fit min-w-28">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          Цайвар
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          Бараан
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          Систем
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
