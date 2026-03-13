'use client';

import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, orderBy, Timestamp } from 'firebase/firestore';
import { MessageSquareWarning, CheckCircle, Clock, Building2 } from 'lucide-react';
import { db } from '@/firebaseConfig';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

interface Consulta {
  id: string;
  booking_id: string;
  guest_name: string;
  room_name: string;
  mensaje_usuario: string;
  respuesta_bot: string;
  status: 'pending' | 'resolved';
  timestamp: Timestamp;
}

export const AdminConsultas: React.FC = () => {
  const [consultas, setConsultas] = useState<Consulta[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const q = query(
        collection(db, 'consultas'), 
        where('status', '==', 'pending'),
        orderBy('timestamp', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs: Consulta[] = [];
      snapshot.forEach(d => docs.push({ id: d.id, ...d.data() } as Consulta));
      setConsultas(docs);
      setIsLoading(false);
    }, (error) => {
        console.error("Error al obtener consultas:", error);
        setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const marcarResuelto = async (id: string) => {
      try {
          await updateDoc(doc(db, 'consultas', id), { status: 'resolved' });
      } catch (error) {
          console.error("Error al actualizar", error);
      }
  };

  return (
    <Card className="w-full max-w-6xl mx-auto">
      <CardHeader>
        <div className="flex items-center gap-3">
            <div className="p-3 bg-destructive/10 rounded-xl text-destructive">
                <MessageSquareWarning size={28} />
            </div>
            <div>
                <CardTitle className="text-2xl font-bold font-headline">Consultas Derivadas</CardTitle>
                <CardDescription>Peticiones especiales escaladas por el Bot Sofía</CardDescription>
            </div>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
            <div className="space-y-4">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
            </div>
        ) : consultas.length === 0 ? (
            <div className="bg-background rounded-lg border-2 border-dashed p-12 text-center">
                <CheckCircle className="mx-auto text-green-500 mb-4" size={48} />
                <h3 className="text-xl font-bold text-foreground">Todo bajo control</h3>
                <p className="text-muted-foreground">No hay consultas pendientes en este momento.</p>
            </div>
        ) : (
            <div className="grid gap-4">
                {consultas.map(consulta => (
                    <div key={consulta.id} className="bg-card rounded-lg border border-l-4 border-destructive shadow-sm p-5 flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                                <Badge variant="destructive">
                                    <Clock size={14} className="mr-1.5"/> Nueva Consulta
                                </Badge>
                                <span className="text-muted-foreground text-sm">Reserva #{consulta.booking_id}</span>
                            </div>
                            
                            <div className="flex items-center gap-2 mb-4">
                                <Building2 size={18} className="text-muted-foreground" />
                                <h3 className="font-bold text-foreground text-lg">{consulta.room_name}</h3>
                                <span className="text-muted-foreground font-medium ml-2">- {consulta.guest_name}</span>
                            </div>

                            <div className="bg-muted/50 p-4 rounded-xl border mb-3">
                                <p className="text-xs text-muted-foreground mb-1 font-bold">El huésped pidió:</p>
                                <p className="text-foreground italic font-medium">"{consulta.mensaje_usuario}"</p>
                            </div>
                            
                            <div className="pl-2 border-l-2 border-primary/20">
                                <p className="text-xs text-primary font-bold mb-1">Sofía respondió:</p>
                                <p className="text-sm text-muted-foreground">"{consulta.respuesta_bot}"</p>
                            </div>
                        </div>

                        <Button 
                            onClick={() => marcarResuelto(consulta.id)}
                            className="bg-green-600 hover:bg-green-700 text-white font-bold whitespace-nowrap active:scale-95"
                            size="lg"
                        >
                            <CheckCircle className="mr-2" size={16}/>
                            Marcar como Resuelto
                        </Button>
                    </div>
                ))}
            </div>
        )}
      </CardContent>
    </Card>
  );
};
