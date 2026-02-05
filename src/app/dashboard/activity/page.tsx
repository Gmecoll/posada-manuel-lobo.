
"use client"

import { useState, useEffect } from "react"
import { collection, onSnapshot, query, orderBy } from "firebase/firestore"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { History } from "lucide-react"

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

type ActivityLog = {
  id: string
  description?: string
  timestamp: {
    seconds: number
    nanoseconds: number
  } | null
}

export default function DashboardPage() {
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const logsCol = collection(db, "activity_logs")
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
        }) as ActivityLog[]
        setActivityLogs(logs)
        setIsLoading(false)
      },
      (error) => {
        console.error("Error fetching activity logs:", error)
        setIsLoading(false)
      }
    )

    return () => unsubscribe()
  }, [])

  const formatTimestamp = (timestamp: ActivityLog["timestamp"]) => {
    if (!timestamp) return "Fecha no disponible"
    const date = new Date(timestamp.seconds * 1000)
    return format(date, "dd/MM/yyyy, HH:mm 'hs'", { locale: es })
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        <div className="flex items-center gap-3 mb-6">
          <History className="w-8 h-8 text-slate-700" />
          <h1 className="text-3xl font-bold text-slate-800 font-headline">Actividad Reciente</h1>
        </div>

        <Card className="shadow-sm border-slate-200">
          <CardHeader className="border-b border-slate-100 bg-white">
            <CardTitle className="font-headline flex items-center gap-2 text-slate-700">
              <History className="h-5 w-5 text-slate-500" />
              Historial General
            </CardTitle>
            <CardDescription>
              Registro de todas las acciones importantes en la posada.
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
                    <TableHead className="pl-6">Descripción</TableHead>
                    <TableHead className="w-[200px] text-right pr-6">Fecha y Hora</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activityLogs.length > 0 ? (
                    activityLogs.map((log) => (
                      <TableRow key={log.id} className="hover:bg-slate-50 transition-colors">
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
                        No hay actividad registrada.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
