"use client"

import { useState, useEffect } from "react"
import {
  collection,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { ShieldCheck } from "lucide-react"

import { db } from "@/firebaseConfig"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableHead,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"

type AccessLog = {
  id: string
  description?: string
  timestamp: {
    seconds: number
    nanoseconds: number
  } | null
}

export default function AccessLogReport() {
  const [accessLogs, setAccessLogs] = useState<AccessLog[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const logsCol = collection(db, "log_puerta_principal")
    const q = query(logsCol, orderBy("timestamp", "desc"))

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const logs = snapshot.docs.map((doc) => {
          const data = doc.data()
          return {
            id: doc.id,
            description: data.description,
            timestamp: data.timestamp,
          }
        }) as AccessLog[]
        setAccessLogs(logs)
        setIsLoading(false)
      },
      (error) => {
        console.error("Error fetching access logs:", error)
        setIsLoading(false)
      }
    )

    return () => unsubscribe()
  }, [])

  const formatTimestamp = (timestamp: AccessLog["timestamp"]) => {
    if (!timestamp) return "Fecha no disponible"
    const date = new Date(timestamp.seconds * 1000)
    return format(date, "dd/MM/yyyy, HH:mm 'hs'", { locale: es })
  }

  return (
    <Card className="shadow-sm border-slate-200">
      <CardHeader>
        <CardTitle className="font-headline flex items-center gap-2 text-slate-700">
          <ShieldCheck className="h-5 w-5 text-slate-500" />
          Registro de Accesos
        </CardTitle>
        <CardDescription>
          Últimas aperturas registradas en la puerta principal.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-4 p-6">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow>
                <TableHead className="pl-6">Evento</TableHead>
                <TableHead className="w-[200px] text-right pr-6">
                  Fecha y Hora
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accessLogs.length > 0 ? (
                accessLogs.map((log) => (
                  <TableRow
                    key={log.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <TableCell className="font-medium pl-6 text-slate-600">
                      {log.description || "Evento sin descripción."}
                    </TableCell>
                    <TableCell className="text-right text-sm text-slate-400 pr-6">
                      {formatTimestamp(log.timestamp)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={2}
                    className="h-32 text-center text-slate-400 italic"
                  >
                    No hay registros de acceso.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
