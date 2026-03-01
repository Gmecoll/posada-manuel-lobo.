'use client';

import React, { useState, useEffect } from 'react';
import { db } from '@/firebaseConfig';
import {
  collection,
  query,
  onSnapshot,
  orderBy,
  type Timestamp,
} from 'firebase/firestore';
import {
  FileText,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  User,
  ShieldCheck,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './ui/card';
import { Skeleton } from './ui/skeleton';
import Image from 'next/image';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from './ui/badge';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"

// Types based on the backend function
type GuestVerification = {
  status: 'pending' | 'completed' | 'unmatch' | 'front_only' | 'back_only' | string;
  name: string;
  avatar_url?: string;
};

type BookingWithGuests = {
  id: string;
  guest_name: string;
  room_name: string;
  check_in: string;
  guest_count: number;
  document_status?: string;
  guests_verification?: { [key: string]: GuestVerification };
  document_validated_at?: Timestamp;
};


// Helper to get status info
const getStatusInfo = (status: string) => {
  switch (status) {
    case 'completed':
      return {
        label: 'Completado',
        icon: <CheckCircle className="h-4 w-4 text-green-500" />,
        className: 'bg-green-100 text-green-800 border-green-300',
      };
    case 'unmatch':
      return {
        label: 'No Coincide',
        icon: <XCircle className="h-4 w-4 text-red-500" />,
        className: 'bg-red-100 text-red-800 border-red-300',
      };
    case 'front_only':
    case 'back_only':
      return {
        label: 'Parcial',
        icon: <AlertCircle className="h-4 w-4 text-yellow-500" />,
        className: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      };
    default:
      return {
        label: 'Pendiente',
        icon: <Clock className="h-4 w-4 text-gray-500" />,
        className: 'bg-gray-100 text-gray-800 border-gray-300',
      };
  }
};

const getOverallStatusBadge = (status?: string) => {
    if (!status) return null;
    if (status === 'approved') {
        return <Badge variant="default" className="bg-green-600 hover:bg-green-700"><ShieldCheck className="mr-1 h-3 w-3" /> Aprobado</Badge>
    }
    if (status.startsWith('unmatch')) {
        return <Badge variant="destructive"><AlertCircle className="mr-1 h-3 w-3" /> Revisión Requerida</Badge>
    }
    if (status.startsWith('partial') || status.startsWith('completed')) {
        return <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" /> En Progreso</Badge>
    }
    return <Badge variant="outline">{status}</Badge>
}


export const AdminDocumentPanel: React.FC = () => {
  const [bookings, setBookings] = useState<BookingWithGuests[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'bookings'), orderBy('check_in', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const allBookings = snapshot.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as BookingWithGuests
        );
        // Filter for bookings that have started the verification process
        const relevantBookings = allBookings.filter(
          (b) => b.guests_verification && Object.keys(b.guests_verification).length > 0
        );
        setBookings(relevantBookings);
        setIsLoading(false);
      },
      (err) => {
        console.error('Error al cargar las reservas:', err);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const formatCheckinDate = (dateString: string) => {
    if(!dateString) return "Fecha no disponible";
    try {
        const date = new Date(dateString + 'T00:00:00');
        return format(date, "dd 'de' MMMM, yyyy", { locale: es });
    } catch {
        return dateString;
    }
  }


  if (isLoading) {
    return (
      <div className="space-y-4">
         <Card>
            <CardHeader>
                <CardTitle className="font-headline flex items-center gap-2">
                    <FileText /> Verificación de Identidad
                </CardTitle>
                <CardDescription>
                    Listado de todas las verificaciones de documentos de los huéspedes.
                </CardDescription>
            </CardHeader>
        </Card>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-headline flex items-center gap-2">
            <FileText /> Verificación de Identidad
          </CardTitle>
          <CardDescription>
            Listado de todas las verificaciones de documentos de los huéspedes.
          </CardDescription>
        </CardHeader>
      </Card>

      {bookings.length === 0 && !isLoading ? (
        <Card className="p-12 text-center border-dashed border-2">
            <p className="text-muted-foreground text-sm">No hay verificaciones de documentos para mostrar.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {bookings.map((booking) => (
            <Card key={booking.id} className="flex flex-col">
              <CardHeader>
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle className="text-base">{booking.guest_name}</CardTitle>
                        <CardDescription>Hab: {booking.room_name} &bull; Check-in: {formatCheckinDate(booking.check_in)}</CardDescription>
                    </div>
                    {getOverallStatusBadge(booking.document_status)}
                </div>
              </CardHeader>
              <CardContent className="flex-grow">
                <p className="text-xs font-semibold uppercase text-muted-foreground mb-3">Huéspedes ({booking.guest_count || Object.keys(booking.guests_verification || {}).length})</p>
                <div className="space-y-3">
                  {booking.guests_verification && Object.values(booking.guests_verification).map((guest, index) => {
                      const statusInfo = getStatusInfo(guest.status);
                      return (
                        <div key={index} className="flex items-center gap-3 p-2 bg-slate-50/50 rounded-lg">
                            <Avatar className="h-10 w-10 border">
                                <AvatarImage src={guest.avatar_url} alt={guest.name} />
                                <AvatarFallback><User className="h-5 w-5" /></AvatarFallback>
                            </Avatar>
                            <div className="flex-grow">
                                <p className="font-semibold text-sm">{guest.name}</p>
                                <div className="flex items-center gap-1.5">
                                    {statusInfo.icon}
                                    <span className="text-xs text-muted-foreground">{statusInfo.label}</span>
                                </div>
                            </div>
                        </div>
                      )
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
