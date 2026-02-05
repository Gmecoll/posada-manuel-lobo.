'use client';

import { useState, useEffect } from 'react';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
  doc,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import {
  Card,
  CardContent,
  CardDescription,
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
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Bug } from 'lucide-react';
import { Skeleton } from './ui/skeleton';

type ActivityLog = {
  id: string;
  description: string;
  timestamp: Timestamp;
  type: string;
};

type TtlockAuth = {
  accessToken: string;
  uid: string;
  updatedAt: Timestamp;
};

const formatTimestamp = (timestamp?: Timestamp) => {
  if (!timestamp) return 'N/A';
  const date = timestamp.toDate();
  return formatDistanceToNow(date, { addSuffix: true, locale: es });
};

export function DebugPanel() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [ttlockAuth, setTtlockAuth] = useState<TtlockAuth | null | undefined>(
    undefined
  ); // undefined for loading
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const logsQuery = query(
      collection(db, 'activity_logs'),
      orderBy('timestamp', 'desc'),
      limit(5)
    );
    const unsubscribeLogs = onSnapshot(
      logsQuery,
      (snapshot) => {
        const logsData = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() } as ActivityLog)
        );
        setLogs(logsData);
      },
      (error) => {
        console.error('Error fetching debug logs:', error);
      }
    );

    const ttlockRef = doc(db, 'configuracion_sistema', 'ttlock_auth');
    const unsubscribeTtlock = onSnapshot(
      ttlockRef,
      (doc) => {
        if (doc.exists()) {
          setTtlockAuth(doc.data() as TtlockAuth);
        } else {
          setTtlockAuth(null);
        }
        setIsLoading(false); // Both listeners are now initialized
      },
      (error) => {
        console.error('Error fetching ttlock config:', error);
        setTtlockAuth(null);
        setIsLoading(false);
      }
    );

    return () => {
      unsubscribeLogs();
      unsubscribeTtlock();
    };
  }, []);

  const ttlockStatus =
    ttlockAuth === undefined
      ? { text: 'Cargando...', variant: 'secondary' as const }
      : ttlockAuth?.accessToken
      ? { text: 'Vinculado', variant: 'default' as const }
      : { text: 'No Vinculado', variant: 'destructive' as const };

  return (
    <Card className="border-orange-500/50">
      <CardHeader>
        <CardTitle className="font-headline flex items-center gap-2 text-orange-600">
          <Bug className="h-5 w-5" />
          Panel de Depuración
        </CardTitle>
        <CardDescription>
          Información de estado y últimos eventos del sistema para diagnóstico.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h4 className="mb-2 text-sm font-semibold">Estado del Sistema</h4>
          {isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">
                    Sistema de Cerraduras TTLock
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={ttlockStatus.variant}>
                      {ttlockStatus.text}
                    </Badge>
                  </TableCell>
                </TableRow>
                {ttlockAuth?.updatedAt && (
                  <TableRow>
                    <TableCell>Última Sincronización de Token</TableCell>
                    <TableCell className="text-right">
                      {formatTimestamp(ttlockAuth.updatedAt)}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>
        <div>
          <h4 className="mb-2 text-sm font-semibold">
            Última Actividad Registrada
          </h4>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="w-[150px] text-right">
                      Hace
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.length > 0 ? (
                    logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs">
                          {log.description}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {formatTimestamp(log.timestamp)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={2} className="h-24 text-center">
                        No hay registros de actividad.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
