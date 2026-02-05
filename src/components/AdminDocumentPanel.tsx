'use client';

import React, { useState, useEffect } from 'react';
import { db } from '@/firebaseConfig';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import {
  Check,
  X,
  Eye,
  FileText,
  Clock,
  AlertCircle,
  ExternalLink,
  History,
  CheckCircle,
} from 'lucide-react';
import { Button } from './ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './ui/card';
import { Skeleton } from './ui/skeleton';
import Image from 'next/image';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

// Unified type for all bookings with document info
type BookingWithDoc = {
  id: string;
  guest_name?: string;
  document_url?: string;
  document_status?: string;
  room_number?: string;
  ocr_text?: string;
  document_validated_at?: Timestamp; // Use the same field as the Cloud Function
};

export const AdminDocumentPanel: React.FC = () => {
  // State for pending review
  const [pendingBookings, setPendingBookings] = useState<BookingWithDoc[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<BookingWithDoc | null>(null);
  const [isPendingLoading, setIsPendingLoading] = useState(true);

  // State for history
  const [historyBookings, setHistoryBookings] = useState<BookingWithDoc[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);

  // Shared error state
  const [error, setError] = useState<string | null>(null);

  // Fetch PENDING documents
  useEffect(() => {
    const q = query(
      collection(db, 'bookings'),
      where('document_status', 'in', [
        'pending',
        'manual_review',
        'pending_review',
      ])
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map(
          (d) =>
            ({
              id: d.id,
              ...d.data(),
            } as BookingWithDoc)
        );

        setPendingBookings(docs);
        setIsPendingLoading(false);
        setError(null);
      },
      (error) => {
        console.error('Error al obtener documentos pendientes:', error);
        setError(
          'Error al cargar documentos pendientes. Verifique los permisos de Firestore.'
        );
        setIsPendingLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Fetch APPROVED documents for history
  useEffect(() => {
    const q = query(
      collection(db, 'bookings'),
      where('document_status', '==', 'approved'),
      orderBy('document_validated_at', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map(
          (d) =>
            ({
              id: d.id,
              ...d.data(),
            } as BookingWithDoc)
        );

        setHistoryBookings(docs);
        setIsHistoryLoading(false);
      },
      (error) => {
        console.error('Error al obtener historial de documentos:', error);
        // Don't set a global error here if the other tab works
        setIsHistoryLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleAction = async (id: string, status: 'approved' | 'not_uploaded') => {
    try {
      const updateData: any = {
        document_status: status,
        access_enabled: status === 'approved',
      };
      if (status === 'approved') {
        // Use the same field name as the OCR cloud function for consistency
        updateData.document_validated_at = serverTimestamp();
      }
      await updateDoc(doc(db, 'bookings', id), updateData);

      if (selectedDoc?.id === id) setSelectedDoc(null);
    } catch (err) {
      console.error('Error al actualizar estado:', err);
    }
  };

  const formatTimestamp = (timestamp?: Timestamp) => {
    if (!timestamp) return 'Fecha no disponible';
    const date = new Date(timestamp.seconds * 1000);
    return format(date, "dd MMM yyyy, HH:mm'hs'", { locale: es });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-headline flex items-center gap-2">
            <FileText /> Verificación de Identidad
          </CardTitle>
          <CardDescription>
            Revisa los documentos pendientes o consulta el historial de los ya
            aprobados.
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="pending">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="pending">
            Pendientes ({pendingBookings.length})
          </TabsTrigger>
          <TabsTrigger value="history">Historial Aprobados</TabsTrigger>
        </TabsList>

        {/* PENDING TAB */}
        <TabsContent value="pending" className="mt-6">
          {error && (
            <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed border-destructive bg-destructive/10">
              <AlertCircle className="mx-auto text-destructive mb-4 h-12 w-12" />
              <h3 className="text-lg font-bold text-destructive">
                Error de Permisos
              </h3>
              <p className="text-destructive/80">{error}</p>
            </Card>
          )}
          {!error && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                {isPendingLoading ? (
                  <>
                    <Skeleton className="h-20 w-full rounded-xl" />
                    <Skeleton className="h-20 w-full rounded-xl" />
                  </>
                ) : pendingBookings.length === 0 ? (
                  <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed">
                    <Check className="mx-auto text-green-500 mb-4 h-12 w-12" />
                    <p className="text-muted-foreground">
                      No hay documentos pendientes de revisión.
                    </p>
                  </Card>
                ) : (
                  pendingBookings.map((b) => (
                    <Card
                      key={b.id}
                      onClick={() => setSelectedDoc(b)}
                      className={`transition-all cursor-pointer hover:shadow-md ${
                        selectedDoc?.id === b.id
                          ? 'border-primary ring-1 ring-primary'
                          : ''
                      }`}
                    >
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div
                            className={`w-12 h-12 rounded-full flex items-center justify-center ${
                              b.document_status === 'manual_review'
                                ? 'bg-orange-100'
                                : 'bg-blue-100'
                            }`}
                          >
                            <Clock
                              size={20}
                              className={
                                b.document_status === 'manual_review'
                                  ? 'text-orange-500'
                                  : 'text-blue-500'
                              }
                            />
                          </div>
                          <div>
                            <h3 className="font-bold">
                              {b.guest_name || 'Huésped Sin Nombre'}
                            </h3>
                            <p className="text-xs text-muted-foreground">
                              Hab: {b.room_number || 'N/A'}
                            </p>
                          </div>
                        </div>
                        <Eye size={18} className="text-muted-foreground" />
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>

              <div className="lg:sticky lg:top-6">
                {selectedDoc ? (
                  <Card className="overflow-hidden shadow-xl border-t-4 border-t-primary animate-in fade-in slide-in-from-right-4">
                    <CardHeader className="flex flex-row items-center justify-between bg-muted/30">
                      <CardTitle className="text-sm font-bold uppercase tracking-wider">
                        Documento del Huésped
                      </CardTitle>
                      {selectedDoc.document_url && (
                        <a
                          href={selectedDoc.document_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline flex items-center gap-1 text-xs font-medium"
                        >
                          <ExternalLink size={14} /> Ver Original
                        </a>
                      )}
                    </CardHeader>
                    <CardContent className="p-4 space-y-4">
                      <div className="relative aspect-[4/3] w-full bg-slate-950 rounded-lg overflow-hidden border shadow-inner">
                        {selectedDoc.document_url ? (
                          <Image
                            src={selectedDoc.document_url}
                            alt="Documento de identidad"
                            fill
                            unoptimized
                            className="object-contain"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center h-full text-white/50 gap-2">
                            <Loader2 className="animate-spin" />
                            <p className="text-xs">Cargando imagen...</p>
                          </div>
                        )}
                      </div>

                      {selectedDoc.ocr_text && (
                        <div className="p-3 bg-muted rounded-md border text-[10px] font-mono text-muted-foreground max-h-24 overflow-y-auto">
                          <p className="font-bold mb-1 text-primary">
                            TEXTO DETECTADO POR OCR:
                          </p>
                          {selectedDoc.ocr_text}
                        </div>
                      )}

                      <div className="flex gap-3 pt-2">
                        <Button
                          onClick={() =>
                            handleAction(selectedDoc.id, 'approved')
                          }
                          className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold"
                        >
                          <Check size={18} className="mr-2" /> APROBAR
                        </Button>
                        <Button
                          onClick={() =>
                            handleAction(selectedDoc.id, 'not_uploaded')
                          }
                          className="flex-1 font-bold"
                          variant="destructive"
                        >
                          <X size={18} className="mr-2" /> RECHAZAR
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="h-[400px] border-2 border-dashed rounded-3xl flex flex-col items-center justify-center text-muted-foreground bg-muted/5">
                    <Eye size={48} className="mb-4 opacity-10" />
                    <p className="font-medium">
                      Selecciona un documento para verificar
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </TabsContent>

        {/* HISTORY TAB */}
        <TabsContent value="history" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-headline flex items-center gap-2">
                <History /> Historial de Aprobados
              </CardTitle>
              <CardDescription>
                Listado de los últimos documentos de identidad que han sido
                verificados y aprobados.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isHistoryLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl" />
                ))
              ) : historyBookings.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-center border-dashed rounded-lg">
                  <CheckCircle className="mx-auto text-muted-foreground/50 mb-4 h-12 w-12" />
                  <p className="text-muted-foreground">
                    Aún no se han aprobado documentos.
                  </p>
                </div>
              ) : (
                historyBookings.map((b) => (
                  <Card key={b.id}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full flex items-center justify-center bg-green-100">
                          <CheckCircle size={20} className="text-green-600" />
                        </div>
                        <div>
                          <h3 className="font-bold">
                            {b.guest_name || 'Huésped Sin Nombre'}
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            Hab: {b.room_number || 'N/A'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">Aprobado</p>
                        <p className="text-xs text-muted-foreground">
                          {formatTimestamp(b.document_validated_at)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

// Componente Loader auxiliar si no existe en tu carpeta UI
const Loader2 = ({
  className,
  size = 20,
}: {
  className?: string;
  size?: number;
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`animate-spin ${className}`}
  >
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);
