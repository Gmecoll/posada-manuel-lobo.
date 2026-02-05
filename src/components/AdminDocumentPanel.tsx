'use client'

import React, { useState, useEffect } from 'react';
import { db } from '@/firebaseConfig';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { Check, X, Eye, FileText, Clock, AlertCircle, ExternalLink } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Skeleton } from './ui/skeleton';
import Image from 'next/image';

// Tipado estricto con los campos exactos de tu Firestore
type PendingBooking = {
  id: string;
  guest_name?: string;
  document_url?: string; 
  document_status?: string; 
  room_number?: string;
  ocr_text?: string;
};

export const AdminDocumentPanel: React.FC = () => {
  const [bookings, setBookings] = useState<PendingBooking[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<PendingBooking | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Filtramos por los estados que genera el flujo de la Llave y el OCR
    const q = query(
      collection(db, 'bookings'),
      where('document_status', 'in', ['pending', 'manual_review', 'pending_review'])
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      })) as PendingBooking[];
      
      setBookings(docs);
      setIsLoading(false);
    }, (error) => {
      console.error("Error al obtener documentos:", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleAction = async (id: string, status: 'approved' | 'not_uploaded') => {
    try {
      await updateDoc(doc(db, 'bookings', id), {
        document_status: status,
        // Si aprobamos, habilitamos el acceso automáticamente
        access_enabled: status === 'approved' ? true : false,
        verified_at: new Date().toISOString()
      });
      if (selectedDoc?.id === id) setSelectedDoc(null);
    } catch (err) {
      console.error("Error al actualizar estado:", err);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-headline flex items-center gap-2">
             <FileText /> Verificación de Identidad
          </CardTitle>
          <CardDescription>
            Revisión manual de documentos. {bookings.length} pendiente(s).
          </CardDescription>
        </CardHeader>
      </Card>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          {isLoading ? (
            <><Skeleton className="h-20 w-full rounded-xl" /><Skeleton className="h-20 w-full rounded-xl" /></>
          ) : bookings.length === 0 ? (
            <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed">
              <Check className="mx-auto text-green-500 mb-4 h-12 w-12" />
              <p className="text-muted-foreground">No hay documentos pendientes de revisión.</p>
            </Card>
          ) : (
            bookings.map((b) => (
              <Card 
                key={b.id} 
                onClick={() => setSelectedDoc(b)}
                className={`transition-all cursor-pointer hover:shadow-md ${
                  selectedDoc?.id === b.id ? 'border-primary ring-1 ring-primary' : ''
                }`}
              >
                <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                          b.document_status === 'manual_review' ? 'bg-orange-100' : 'bg-blue-100'
                        }`}>
                            <Clock size={20} className={b.document_status === 'manual_review' ? 'text-orange-500' : 'text-blue-500'} />
                        </div>
                        <div>
                            <h3 className="font-bold">{b.guest_name || 'Huésped Sin Nombre'}</h3>
                            <p className="text-xs text-muted-foreground">Hab: {b.room_number || 'N/A'}</p>
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
                <CardTitle className="text-sm font-bold uppercase tracking-wider">Documento del Huésped</CardTitle>
                 {selectedDoc.document_url && (
                   <a href={selectedDoc.document_url} target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-1 text-xs font-medium">
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
                    <p className="font-bold mb-1 text-primary">TEXTO DETECTADO POR OCR:</p>
                    {selectedDoc.ocr_text}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                   <Button onClick={() => handleAction(selectedDoc.id, 'approved')} className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold">
                     <Check size={18} className="mr-2" /> APROBAR
                  </Button>
                  <Button onClick={() => handleAction(selectedDoc.id, 'not_uploaded')} className="flex-1 font-bold" variant="destructive">
                    <X size={18} className="mr-2" /> RECHAZAR
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="h-[400px] border-2 border-dashed rounded-3xl flex flex-col items-center justify-center text-muted-foreground bg-muted/5">
              <Eye size={48} className="mb-4 opacity-10" />
              <p className="font-medium">Selecciona un documento para verificar</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Componente Loader auxiliar si no existe en tu carpeta UI
const Loader2 = ({ className, size = 20 }: { className?: string, size?: number }) => (
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