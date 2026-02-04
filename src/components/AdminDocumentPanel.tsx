'use client'

import React, { useState, useEffect } from 'react';
import { db } from '@/firebaseConfig';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { Check, X, Eye, FileText, Clock, AlertCircle, ExternalLink } from 'lucide-react';
import type { Booking } from '@/lib/data';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Skeleton } from './ui/skeleton';
import Image from 'next/image';

type PendingBooking = Booking & {
  id: string;
  guest_name: string;
  documentUrl: string;
  documentStatus: 'pending' | 'manual_review' | 'approved' | 'not_uploaded';
  room_number: string;
};


export const AdminDocumentPanel: React.FC = () => {
  const [bookings, setBookings] = useState<PendingBooking[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<PendingBooking | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Listen for bookings that need attention (pending or manual review)
    const q = query(
      collection(db, 'bookings'),
      where('documentStatus', 'in', ['pending', 'manual_review'])
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      })) as PendingBooking[];
      setBookings(docs);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching pending documents:", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleAction = async (id: string, status: 'approved' | 'not_uploaded') => {
    try {
      await updateDoc(doc(db, 'bookings', id), {
        documentStatus: status,
        verifiedAt: new Date().toISOString()
      });
      if (selectedDoc?.id === id) setSelectedDoc(null);
    } catch (err) {
      console.error("Error updating status:", err);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-headline flex items-center gap-2">
             <FileText /> Verificación de Identidad
          </CardTitle>
          <CardDescription>Gestiona los check-ins que requieren validación manual. Hay {bookings.length} pendiente(s).</CardDescription>
        </CardHeader>
      </Card>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PENDING LIST */}
        <div className="space-y-4">
          {isLoading ? (
            <>
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </>
          ) : bookings.length === 0 ? (
            <Card className="flex flex-col items-center justify-center p-12 text-center">
              <Check className="mx-auto text-green-500 mb-4 h-12 w-12" />
              <p className="text-muted-foreground">¡Todo al día! No hay documentos pendientes.</p>
            </Card>
          ) : (
            bookings.map((b) => (
              <Card 
                key={b.id} 
                onClick={() => setSelectedDoc(b)}
                className={`transition-all cursor-pointer ${
                  selectedDoc?.id === b.id ? 'border-primary' : 'hover:border-muted-foreground/50'
                }`}
              >
                <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${b.documentStatus === 'manual_review' ? 'bg-orange-100' : 'bg-blue-100'}`}>
                            <Clock size={20} className={b.documentStatus === 'manual_review' ? 'text-orange-500' : 'text-blue-500'} />
                        </div>
                        <div>
                            <h3 className="font-bold">{b.guest_name || 'Huésped sin nombre'}</h3>
                            <p className="text-xs text-muted-foreground">Habitación: {b.room_number}</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleAction(b.id, 'approved'); }} className="text-green-600 hover:bg-green-100 hover:text-green-700">
                            <Check size={18} />
                        </Button>
                         <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleAction(b.id, 'not_uploaded'); }} className="text-red-600 hover:bg-red-100 hover:text-red-700">
                            <X size={18} />
                        </Button>
                    </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* DOCUMENT PREVIEW */}
        <div className="sticky top-6">
          {selectedDoc ? (
            <Card className="overflow-hidden shadow-lg animate-in fade-in slide-in-from-right-5 duration-300">
              <CardHeader className="flex flex-row items-center justify-between bg-muted/50">
                <CardTitle className="text-base">Vista Previa</CardTitle>
                 {selectedDoc.documentUrl && <a href={selectedDoc.documentUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-1 text-xs">
                  <ExternalLink size={14} /> Abrir original
                </a>}
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                <div className="relative aspect-[4/3] w-full bg-black rounded-md overflow-hidden border">
                  {selectedDoc.documentUrl ? (
                    <Image src={selectedDoc.documentUrl} alt="Documento de identidad" fill className="object-contain" />
                  ) : <div className="flex items-center justify-center h-full text-muted-foreground">No hay imagen</div>}
                </div>

                {selectedDoc.documentStatus === 'manual_review' && (
                  <div>
                    <h4 className="text-xs font-bold text-muted-foreground uppercase mb-2 flex items-center gap-2">
                      <AlertCircle size={14} /> Texto detectado por OCR:
                    </h4>
                    <div className="bg-muted/50 p-3 rounded-lg border text-xs font-mono text-muted-foreground max-h-32 overflow-y-auto">
                      {selectedDoc.ocrText || "El OCR no pudo extraer texto legible."}
                    </div>
                  </div>
                )}
                
                <div className="flex gap-4 pt-4">
                   <Button onClick={() => handleAction(selectedDoc.id, 'approved')} className="flex-1" variant="default">
                     <Check size={20} /> APROBAR
                  </Button>
                  <Button onClick={() => handleAction(selectedDoc.id, 'not_uploaded')} className="flex-1" variant="destructive">
                    <X size={20} /> RECHAZAR
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="h-96 border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-muted-foreground">
              <Eye size={48} className="mb-4 opacity-50" />
              <p>Selecciona una reserva para revisar</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
