"use client"

import * as React from "react"

import { createClient } from "@/lib/supabase/client"
import { getDevDateOverride, setDevDateOverride } from "@/lib/dev-date"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  CalendarClockIcon,
  ChevronsUpDownIcon,
  DicesIcon,
  Trash2Icon,
} from "lucide-react"

// Тест горимын хэрэгслүүд: тест огноо + датаг цэвэрлэх RPC-ууд (0018) +
// санамсаргүй үлдэгдэл (0024).
// Бодит ашиглалтад гарахад (Үе 6) энэ цэсийг бүхэлд нь хасна.
type ResetKind = "all" | "orders"

const RESET_INFO: Record<ResetKind, { title: string; desc: string; rpc: string }> = {
  all: {
    title: "Бүх гүйлгээний датаг устгах уу?",
    desc: "Захиалга, батч, хүргэлт, орлого, зарлага, ledger, цехийн тооллого бүгд устана. Лавлагаа (захиалагч, материал, ТК г.м.) үлдэнэ. Буцаах боломжгүй!",
    rpc: "dev_reset_all",
  },
  orders: {
    title: "Захиалга + үйлдвэрлэл + зарлагыг устгах уу?",
    desc: "Захиалга, батч, хүргэлт, зарлага, цехийн тооллого устана. Агуулахын орлого хэвээр тул зарлагаар хасагдсан үлдэгдэл буцаж нэмэгдэнэ. Буцаах боломжгүй!",
    rpc: "dev_reset_orders",
  },
}

export function NavUser({
  user,
}: {
  user: {
    name: string
    email: string
    avatar: string
  }
}) {
  const { isMobile } = useSidebar()
  const supabase = React.useMemo(() => createClient(), [])

  const [testDate, setTestDate] = React.useState("")
  React.useEffect(() => {
    setTestDate(getDevDateOverride() ?? "")
  }, [])

  const [resetKind, setResetKind] = React.useState<ResetKind | null>(null)
  const [resetting, setResetting] = React.useState(false)
  const [resetError, setResetError] = React.useState<string | null>(null)

  // Санамсаргүй үлдэгдэл (0024) — ledger-т adjust мөрөөр бичигдэнэ
  const [randomOpen, setRandomOpen] = React.useState(false)
  const [randomizing, setRandomizing] = React.useState(false)
  const [randomError, setRandomError] = React.useState<string | null>(null)

  function applyTestDate(value: string) {
    setDevDateOverride(value || null)
    // Бүх дэлгэцийн default огноог шинэчлэхийн тулд дахин ачаална
    window.location.reload()
  }

  async function runReset() {
    if (!resetKind) return
    setResetting(true)
    setResetError(null)
    const { error } = await supabase.rpc(RESET_INFO[resetKind].rpc, {
      p_confirm: "RESET",
    })
    setResetting(false)
    if (error) {
      setResetError(error.message)
      return
    }
    setResetKind(null)
    window.location.reload()
  }

  async function runRandomStock() {
    setRandomizing(true)
    setRandomError(null)
    const { error } = await supabase.rpc("dev_random_stock", {
      p_confirm: "RANDOM",
    })
    setRandomizing(false)
    if (error) {
      setRandomError(error.message)
      return
    }
    setRandomOpen(false)
    window.location.reload()
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton size="lg" className="aria-expanded:bg-muted" />
            }
          >
            <Avatar>
              <AvatarImage src={user.avatar} alt={user.name} />
              <AvatarFallback>CN</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs">{user.email}</span>
            </div>
            <ChevronsUpDownIcon className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-64"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar>
                    <AvatarImage src={user.avatar} alt={user.name} />
                    <AvatarFallback>CN</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user.name}</span>
                    <span className="truncate text-xs">{user.email}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />

            {/* Тест огноо: дэлгэцүүдийн default "өнөөдөр"-ийг солино */}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex items-center gap-2 text-xs text-muted-foreground">
                <CalendarClockIcon className="size-3.5" />
                Тест огноо {testDate ? "(идэвхтэй)" : ""}
              </DropdownMenuLabel>
              <div
                className="flex items-center gap-1 px-2 pb-2"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <Input
                  type="date"
                  className="h-8"
                  value={testDate}
                  onChange={(e) => setTestDate(e.target.value)}
                />
                <Button size="sm" onClick={() => applyTestDate(testDate)}>
                  ОК
                </Button>
                {getDevDateOverride() && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => applyTestDate("")}
                  >
                    Болих
                  </Button>
                )}
              </div>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />

            {/* Туршилтын үлдэгдэл оноох (0024) */}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Туршилтын үлдэгдэл
              </DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => {
                  setRandomError(null)
                  setRandomOpen(true)
                }}
              >
                <DicesIcon />
                Агуулахын үлдэгдэл random
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />

            {/* Туршилтын дата цэвэрлэх (reset.sql-ийн А/Б хэсэг) */}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Туршилтын дата цэвэрлэх
              </DropdownMenuLabel>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  setResetError(null)
                  setResetKind("orders")
                }}
              >
                <Trash2Icon />
                Захиалга + үйлдвэрлэл (Б)
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  setResetError(null)
                  setResetKind("all")
                }}
              >
                <Trash2Icon />
                Бүх гүйлгээний дата (А)
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Цэвэрлэхийн өмнөх баталгаажуулалт */}
        <Dialog
          open={resetKind !== null}
          onOpenChange={(open) => {
            if (!open) setResetKind(null)
          }}
        >
          <DialogContent className="sm:max-w-md">
            {resetKind && (
              <>
                <DialogHeader>
                  <DialogTitle>{RESET_INFO[resetKind].title}</DialogTitle>
                  <DialogDescription>
                    {RESET_INFO[resetKind].desc}
                  </DialogDescription>
                </DialogHeader>
                {resetError && (
                  <p className="text-sm text-destructive">{resetError}</p>
                )}
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setResetKind(null)}
                    disabled={resetting}
                  >
                    Болих
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={runReset}
                    disabled={resetting}
                  >
                    <Trash2Icon />
                    {resetting ? "Устгаж байна..." : "Устгах"}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Санамсаргүй үлдэгдэл оноохын өмнөх баталгаажуулалт */}
        <Dialog open={randomOpen} onOpenChange={setRandomOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Агуулахын үлдэгдлийг random болгох уу?</DialogTitle>
              <DialogDescription>
                Идэвхтэй материал бүрийн үлдэгдлийг санамсаргүй тоо руу
                хүргэнэ (ш 100–2000, л 10–100, кг 20–200). Ledger-т залруулга
                (adjust) мөрөөр бичигдэх тул түүх мөшгигдөнө — гүйлгээ устахгүй.
              </DialogDescription>
            </DialogHeader>
            {randomError && (
              <p className="text-sm text-destructive">{randomError}</p>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setRandomOpen(false)}
                disabled={randomizing}
              >
                Болих
              </Button>
              <Button onClick={runRandomStock} disabled={randomizing}>
                <DicesIcon />
                {randomizing ? "Оноож байна..." : "Оноох"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
