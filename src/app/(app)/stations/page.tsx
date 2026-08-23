"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { useDevUser } from "@/components/dev-user-provider"

// /stations руу орвол: цехийн ажилтан өөрийн цех рүү, бусад нь Бэлтгэл рүү
export default function StationsIndexPage() {
  const router = useRouter()
  const { user } = useDevUser()

  React.useEffect(() => {
    const target =
      user.role === "station" && user.station ? user.station : "prep"
    router.replace(`/stations/${target}`)
  }, [router, user])

  return null
}
