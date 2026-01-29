
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

export default function ActivityPage() {
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const logsCol = collection(db, "activity_logs")
    const q = query(logsCol, orderBy("timestamp", "desc"))

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const logs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as ActivityLog[]
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
    <Card>
      <CardHeader>
        <CardTitle className="font-headline flex items-center gap-2">
          <History className="h-6 w-6" />
          Actividad Reciente
        </CardTitle>
        <CardDescription>
          Un registro de las últimas acciones en la posada.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4 px-1 pt-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-4/5" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-3/4" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descripción</TableHead>
                <TableHead className="w-[200px] text-right">Cuándo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activityLogs.length > 0 ? (
                activityLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium">
                      {log.description || "Evento sin descripción."}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {formatTimestamp(log.timestamp)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={2}
                    className="h-24 text-center text-muted-foreground"
                  >
                    Aún no hay actividad registrada.
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
