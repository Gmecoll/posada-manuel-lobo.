'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Bell, DollarSign, Package, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ServiceRequest as ServiceRequestData } from '@/lib/data';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface ServiceRequest extends ServiceRequestData {
  id: string;
  fecha: Timestamp;
}

export function ServiceRequestNotifier() {
  const [newRequests, setNewRequests] = useState<ServiceRequest[]>([]);
  const [allRequests, setAllRequests] = useState<ServiceRequest[]>([]);
  const [currentRequest, setCurrentRequest] = useState<ServiceRequest | null>(null);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Listen for requests to update the badge and queue.
    // We fetch all sorted requests and filter for unread ones on the client
    // to avoid needing a Firestore composite index.
    const q = query(
      collection(db, 'solicitudes_servicios'),
      orderBy('fecha', 'asc') // Oldest first
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allSortedRequests = snapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() }) as ServiceRequest
      );
      const unread = allSortedRequests.filter(req => req.leido === false);
      setNewRequests(unread);
    });

    return () => unsubscribe();
  }, []);
  
  useEffect(() => {
    // Listen for all requests for the report
    const q = query(
      collection(db, 'solicitudes_servicios'),
      orderBy('fecha', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const all = snapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() }) as ServiceRequest
      );
      setAllRequests(all);
    });

    return () => unsubscribe();
  }, []);

  const handleCircleClick = () => {
    if (newRequests.length > 0) {
      const nextRequest = newRequests[0];
      setCurrentRequest(nextRequest);
    } else {
      setIsReportOpen(true);
    }
  };

  const handleMarkAsRead = async () => {
    if (!currentRequest) return;

    const requestRef = doc(db, 'solicitudes_servicios', currentRequest.id);
    try {
      await updateDoc(requestRef, { leido: true });
      toast({
        title: 'Solicitud marcada como leída',
        description: `La solicitud de ${currentRequest.nombreServicio} ha sido marcada.`,
      });
    } catch (error) {
      console.error('Error marking request as read:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo marcar la solicitud como leída.',
      });
    } finally {
      // Just close the dialog. The listener will update the newRequests state.
      setCurrentRequest(null);
    }
  };

  const formatTimestamp = (timestamp: Timestamp) => {
    if (!timestamp) return "Fecha no disponible";
    const date = new Date(timestamp.seconds * 1000);
    return format(date, "dd/MM/yy, HH:mm'hs'", { locale: es });
  };
  
  const reportData = useMemo(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentRequests = allRequests.filter(req => {
        if (!req.fecha) return false;
        return req.fecha.toDate() >= thirtyDaysAgo;
    });

    const totalRevenue = recentRequests
      .filter(req => req.estado_pago === 'completado')
      .reduce((sum, req) => sum + req.monto, 0);

    const mostRequested = recentRequests.length > 0 
        ? Object.entries(recentRequests.reduce((acc, req) => {
            acc[req.nombreServicio] = (acc[req.nombreServicio] || 0) + 1;
            return acc;
          }, {} as Record<string, number>))
          .sort((a, b) => b[1] - a[1])[0][0]
        : "N/A";
    
    return {
        requests: recentRequests,
        totalRevenue,
        totalRequests: recentRequests.length,
        mostRequestedService: mostRequested
    }
  }, [allRequests]);


  return (
    <>
      <Button
        onClick={handleCircleClick}
        variant="default"
        className="fixed bottom-6 right-6 z-50 h-16 w-16 rounded-full shadow-lg flex items-center justify-center data-[state=open]:bg-primary"
      >
        <Bell className="h-8 w-8" />
        <Badge variant={newRequests.length > 0 ? "destructive" : "secondary"} className="absolute -top-1 -right-1 h-7 w-7 justify-center rounded-full p-0 text-sm">
          {newRequests.length}
        </Badge>
      </Button>

      {currentRequest && (
        <AlertDialog open={!!currentRequest} onOpenChange={() => setCurrentRequest(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="font-headline text-2xl">¡Nueva Solicitud de Servicio!</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="text-base pt-4 space-y-2 text-foreground">
                  <p><strong>Huésped:</strong> {currentRequest.guestName}</p>
                  <p><strong>Habitación:</strong> {currentRequest.roomNumber || 'N/A'}</p>
                  <p><strong>Servicio:</strong> {currentRequest.nombreServicio}</p>
                  <p><strong>Monto:</strong> UY$ {currentRequest.monto.toFixed(2)}</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction onClick={handleMarkAsRead}>Marcar como visto</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <Dialog open={isReportOpen} onOpenChange={setIsReportOpen}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-headline text-2xl">Reporte de Servicios</DialogTitle>
            <DialogDescription>Actividad de los últimos 30 días.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-3 py-4">
             <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Recaudado</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">UY$ {reportData.totalRevenue.toFixed(2)}</div>
                    <p className="text-xs text-muted-foreground">Pagos completados.</p>
                </CardContent>
             </Card>
             <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Solicitudes Totales</CardTitle>
                    <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{reportData.totalRequests}</div>
                     <p className="text-xs text-muted-foreground">En los últimos 30 días.</p>
                </CardContent>
             </Card>
             <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Servicio Más Pedido</CardTitle>
                    <Package className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="truncate text-2xl font-bold">{reportData.mostRequestedService}</div>
                    <p className="text-xs text-muted-foreground">Basado en solicitudes.</p>
                </CardContent>
             </Card>
          </div>
          <div className="flex-grow overflow-auto border rounded-lg">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Servicio</TableHead>
                        <TableHead>Huésped</TableHead>
                        <TableHead>Monto</TableHead>
                        <TableHead>Estado</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {reportData.requests.length > 0 ? (
                        reportData.requests.map(req => (
                            <TableRow key={req.id}>
                                <TableCell className="text-sm text-muted-foreground">{formatTimestamp(req.fecha)}</TableCell>
                                <TableCell className="font-medium">{req.nombreServicio}</TableCell>
                                <TableCell>{req.guestName}</TableCell>
                                <TableCell>UY$ {req.monto.toFixed(2)}</TableCell>
                                <TableCell>
                                    <Badge variant={req.estado_pago === 'completado' ? 'default' : 'secondary'}>{req.estado_pago}</Badge>
                                </TableCell>
                            </TableRow>
                        ))
                    ) : (
                        <TableRow>
                            <TableCell colSpan={5} className="h-24 text-center">No hay solicitudes en los últimos 30 días.</TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
