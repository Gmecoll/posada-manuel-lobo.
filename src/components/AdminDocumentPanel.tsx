
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
  ChevronDown,
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
import { Textarea } from './ui/textarea';
import { cn } from '@/lib/utils';
import { Alert, AlertTitle } from './ui/alert';

// Tipo unificado para reservas con info de documentos
type BookingWithDoc = {
  id: string;
  guest_name?: string;
  document_url?: string;
  document_status?: 'pending' | 'approved' | 'manual_review' | 'not_uploaded' | 'pending_review';
  room_name?: string;
  ocr_text?: string;
  document_validated_at?: Timestamp;
  comments?: string;
};

export const AdminDocumentPanel: React.FC = () => {
  const [pendingBookings, setPendingBookings] = useState<BookingWithDoc[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<BookingWithDoc | null>(null);
  const [isPendingLoading, setIsPendingLoading] = useState(true);

  const [historyBookings, setHistoryBookings] = useState<BookingWithDoc[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  // New state for history section
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(
    null
  );
  const [currentComment, setCurrentComment] = useState('');

  // 1. Fetch PENDING
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
          (d) => ({ id: d.id, ...d.data() }) as BookingWithDoc
        );
        setPendingBookings(docs);
        setIsPendingLoading(false);
      },
      (err) => {
        console.error('Error Pendientes:', err);
        setError(
          'Error al cargar documentos pendientes. Verifique los permisos de Firestore.'
        );
        setIsPendingLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // 2. Fetch HISTORY
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
          (d) => ({ id: d.id, ...d.data() }) as BookingWithDoc
        );
        setHistoryBookings(docs);
        setIsHistoryLoading(false);
      },
      (err) => {
        console.error('Error Historial (Posible falta de índice):', err);
        setIsHistoryLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleAction = async (
    id: string,
    status: 'approved' | 'not_uploaded'
  ) => {
    try {
      const updateData: any = {
        document_status: status,
        access_enabled: status === 'approved',
      };
      if (status === 'approved') {
        updateData.document_validated_at = serverTimestamp();
      } else {
        updateData.document_url = null;
      }
      await updateDoc(doc(db, 'bookings', id), updateData);
      if (selectedDoc?.id === id) setSelectedDoc(null);
    } catch (err) {
      console.error('Error al actualizar:', err);
    }
  };

  const handleToggleHistory = (booking: BookingWithDoc) => {
    if (expandedHistoryId === booking.id) {
      setExpandedHistoryId(null);
    } else {
      setExpandedHistoryId(booking.id);
      setCurrentComment(booking.comments || '');
    }
  };

  const handleSaveComment = async (bookingId: string) => {
    if (!expandedHistoryId) return;
    try {
      const bookingRef = doc(db, 'bookings', bookingId);
      await updateDoc(bookingRef, {
        comments: currentComment,
      });
      // Optionally show a toast here
    } catch (error) {
      console.error('Error saving comment:', error);
    }
  };

  const formatTimestamp = (timestamp?: Timestamp) => {
    if (!timestamp) return 'Recién aprobado';
    const date = new Date(timestamp.seconds * 1000);
    return format(date, "dd MMM, HH:mm'hs'", { locale: es });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-headline flex items-center gap-2">
            <FileText /> Verificación de Identidad
          </CardTitle>
          <CardDescription>
            Gestión de documentos para acceso a cerraduras.
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="pending">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="pending">
            Pendientes ({pendingBookings.length})
          </TabsTrigger>
          <TabsTrigger value="history">
            Historial ({historyBookings.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-6">
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error de Permisos</AlertTitle>
              <p>{error}</p>
            </Alert>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              {isPendingLoading ? (
                <Skeleton className="h-20 w-full rounded-xl" />
              ) : pendingBookings.length === 0 ? (
                <Card className="p-12 text-center border-dashed border-2">
                  <Check className="mx-auto text-green-500 mb-2" />
                  <p className="text-muted-foreground text-sm">Todo al día.</p>
                </Card>
              ) : (
                pendingBookings.map((b) => (
                  <Card
                    key={b.id}
                    onClick={() => setSelectedDoc(b)}
                    className={`cursor-pointer transition-colors ${
                      selectedDoc?.id === b.id
                        ? 'border-primary bg-primary/5'
                        : ''
                    }`}
                  >
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div
                          className={`p-2 rounded-full ${
                            b.document_status === 'manual_review'
                              ? 'bg-orange-100 text-orange-600'
                              : 'bg-blue-100 text-blue-600'
                          }`}
                        >
                          <Clock size={20} />
                        </div>
                        <div>
                          <p className="font-bold text-sm">
                            {b.guest_name || 'Huésped'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Hab: {b.room_name}
                          </p>
                        </div>
                      </div>
                      <Eye size={16} className="text-muted-foreground" />
                    </CardContent>
                  </Card>
                ))
              )}
            </div>

            <div className="lg:sticky lg:top-6">
              {selectedDoc ? (
                <Card className="overflow-hidden shadow-lg border-t-4 border-primary">
                  <CardHeader className="py-3 bg-muted/30 flex flex-row justify-between items-center">
                    <CardTitle className="text-xs uppercase">
                      Detalle del Documento
                    </CardTitle>
                    {selectedDoc.document_url && (
                      <a
                        href={selectedDoc.document_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary text-xs flex items-center gap-1"
                      >
                        <ExternalLink size={12} /> Ampliar
                      </a>
                    )}
                  </CardHeader>
                  <CardContent className="p-4 space-y-4">
                    <div className="relative aspect-video w-full bg-black rounded-lg overflow-hidden border">
                      {selectedDoc.document_url ? (
                        <Image
                          src={selectedDoc.document_url}
                          alt="Doc"
                          fill
                          className="object-contain"
                          unoptimized
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full text-white/50">
                          <Loader2 />
                        </div>
                      )}
                    </div>
                    {selectedDoc.ocr_text && (
                      <div className="p-2 bg-slate-100 rounded text-[10px] font-mono max-h-20 overflow-y-auto">
                        <span className="text-primary font-bold">OCR:</span>{' '}
                        {selectedDoc.ocr_text}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleAction(selectedDoc.id, 'approved')}
                        className="flex-1 bg-green-600 hover:bg-green-700"
                      >
                        <Check size={16} className="mr-2" /> Aprobar
                      </Button>
                      <Button
                        onClick={() =>
                          handleAction(selectedDoc.id, 'not_uploaded')
                        }
                        variant="destructive"
                        className="flex-1"
                      >
                        <X size={16} className="mr-2" /> Rechazar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="h-64 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-muted-foreground opacity-50">
                  <Eye size={32} className="mb-2" />
                  <p className="text-sm">Selecciona una revisión</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardContent className="p-0">
              {isHistoryLoading ? (
                <Skeleton className="h-24 w-full m-4" />
              ) : historyBookings.length === 0 ? (
                <p className="text-center py-10 text-muted-foreground text-sm">
                  No hay registros aún.
                </p>
              ) : (
                <div className="space-y-1 p-2">
                  {historyBookings.map((b) => (
                    <Card key={b.id} className="overflow-hidden transition-all">
                      <div
                        onClick={() => handleToggleHistory(b)}
                        className="flex items-center justify-between p-3 hover:bg-muted/10 cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <CheckCircle className="text-green-500" size={20} />
                          <div>
                            <p className="text-sm font-bold">{b.guest_name}</p>
                            <p className="text-[10px] text-muted-foreground">
                              Hab: {b.room_name}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-[10px] font-medium text-green-600 uppercase">
                              Aprobado
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {formatTimestamp(b.document_validated_at)}
                            </p>
                          </div>
                          <ChevronDown
                            className={cn(
                              'transition-transform',
                              expandedHistoryId === b.id && 'rotate-180'
                            )}
                          />
                        </div>
                      </div>

                      {expandedHistoryId === b.id && (
                        <div className="p-4 border-t bg-slate-50/50 space-y-4 animate-in fade-in-0">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                              <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                                Documento Adjunto
                              </h4>
                              {b.document_url ? (
                                <a
                                  href={b.document_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block relative aspect-video w-full bg-black rounded-lg overflow-hidden border hover:opacity-90 transition-opacity"
                                >
                                  <Image
                                    src={b.document_url}
                                    alt="Documento"
                                    fill
                                    className="object-contain"
                                    unoptimized
                                  />
                                </a>
                              ) : (
                                <div className="aspect-video w-full flex items-center justify-center bg-slate-100 text-muted-foreground text-sm rounded-lg">
                                  No hay imagen asociada.
                                </div>
                              )}
                            </div>
                            <div className="space-y-2 flex flex-col">
                              <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                                Comentarios
                              </h4>
                              <Textarea
                                placeholder="Añadir un comentario interno..."
                                value={currentComment}
                                onChange={(e) =>
                                  setCurrentComment(e.target.value)
                                }
                                className="flex-grow"
                              />
                              <Button
                                size="sm"
                                onClick={() => handleSaveComment(b.id)}
                                className="self-end"
                              >
                                Guardar Comentario
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

const Loader2 = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
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
