"use client"

import Link from "next/link"

import { useDevUser } from "@/components/dev-user-provider"
import { canAccess } from "@/lib/permissions"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { BuildingIcon, TruckIcon } from "lucide-react"

const QUICK_LINKS = [
  {
    title: "Захиалагч",
    description: "Захиалагч байгууллагуудын лавлах бүртгэл",
    url: "/customers",
    icon: <BuildingIcon className="size-5" />,
  },
  {
    title: "Нийлүүлэгч",
    description: "Материал нийлүүлэгчдийн лавлах бүртгэл",
    url: "/suppliers",
    icon: <TruckIcon className="size-5" />,
  },
]

export default function HomePage() {
  const { user } = useDevUser()
  const links = QUICK_LINKS.filter((link) => canAccess(user.role, link.url))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Хоол үйлдвэрлэлийн хяналтын систем
        </h1>
        <p className="text-muted-foreground mt-1">
          Захиалга → үйлдвэрлэл → савлагаа → хүргэлт, агуулахын бүртгэл
        </p>
      </div>
      {links.length > 0 ? (
        <div className="grid auto-rows-min gap-4 md:grid-cols-3">
          {links.map((link) => (
            <Link key={link.url} href={link.url}>
              <Card className="hover:bg-muted/50 transition-colors h-full">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    {link.icon}
                    <CardTitle>{link.title}</CardTitle>
                  </div>
                  <CardDescription>{link.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Таны дүрд ({user.roleLabel}) зориулсан дэлгэцүүд одоогоор
          хөгжүүлэгдээгүй байна.
        </p>
      )}
    </div>
  )
}
