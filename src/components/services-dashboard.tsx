
"use client"

import { useState, useEffect } from "react"
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  Timestamp,
} from "firebase/firestore"
import { db } from "@/firebaseConfig"
import type { ServiceRequest } from "@/lib/data"
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card"
import { DollarSign, Package } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableHead,
} from "@/components/ui/table"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "./ui/skeleton"

export function ServicesDashboard() {
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const requestsCol = collection(db, "solicitudes_servicios")
    const q = query(requestsCol, orderBy("fecha", "desc"))
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const requestsFromDb = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as ServiceRequest[]
        setRequests(requestsFromDb)
        setIsLoading(false)
      },
      (error) => {
        console.error("Error fetching service requests:", error)
        setIsLoading(false)
      }
    )
    return () => unsubscribe()
  }, [])

  const totalRecaudadoUYU = requests
    .filter((req) => req.estado_pago === "completado" && req.currency === "UYU")
    .reduce((sum, req) => sum + req.monto, 0)

  const totalRecaudadoUSD = requests
    .filter((req) => req.estado_pago === "completado" && req.currency === "USD")
    .reduce((sum, req) => sum + req.monto, 0)

  const getMostRequestedService = () => {
    if (requests.length === 0) return "N/A"
    const counts = requests.reduce((acc, req) => {
      acc[req.nombreServicio] = (acc[req.nombreServicio] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    return Object.keys(counts).reduce((a, b) =>
      counts[a] > counts[b] ? a : b
    )
  }

  const mostRequestedService = getMostRequestedService()

  const formatTimestamp = (timestamp: Timestamp) => {
    if (!timestamp) return "Fecha no disponible"
    const date = new Date(timestamp.seconds * 1000)
    return format(date, "dd/MM/yyyy, HH:mm 'hs'", { locale: es })
  }

  return (
    <div className="mt-8 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Reportes de Servicios</CardTitle>
          <CardDescription>
            Métricas y actividad reciente de los servicios solicitados.
          </CardDescription>
        </CardHeader>
      </Card>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Recaudado (UYU)
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold">
                UY$ {totalRecaudadoUYU.toFixed(2)}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Suma de pagos completados en Pesos.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Recaudado (USD)
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold">
                U$S {totalRecaudadoUSD.toFixed(2)}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Suma de pagos completados en Dólares.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Servicio Más Pedido
            </CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-3/4" />
            ) : (
              <div className="truncate text-2xl font-bold">
                {mostRequestedService}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Basado en todas las solicitudes.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Solicitudes Recientes</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Servicio</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead>Estado del Pago</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center">
                    Cargando...
                  </TableCell>
                </TableRow>
              ) : requests.length > 0 ? (
                requests.slice(0, 10).map((req) => (
                  <TableRow key={req.id}>
                    <TableCell className="font-medium">
                      {req.nombreServicio}
                    </TableCell>
                    <TableCell>{formatTimestamp(req.fecha)}</TableCell>
                    <TableCell>
                      {req.currency === 'UYU' ? 'UY$' : 'U$S'}{req.monto.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          req.estado_pago === "completado"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {req.estado_pago}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center">
                    No hay solicitudes todavía.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
