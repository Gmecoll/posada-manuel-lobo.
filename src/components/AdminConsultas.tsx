"use client";

import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { MessageSquareWarning, CheckCircle, Clock, Building2 } from 'lucide-react';
import { db } from '../firebaseConfig'; // Ajusta la ruta si es necesario

interface Consulta {
  id: string;
  booking_id: string;
  guest_name: string;
  room_name: string;
  mensaje_usuario: string;
  respuesta_bot: string;
  status: 'pending' | 'resolved';
  timestamp: any;
}

export const AdminConsultas: React.FC = () => {
  const [consultas, setConsultas] = useState<Consulta[]>([]);

  useEffect(() => {
    // 🚀 SOLUCIÓN: Hacemos una consulta plana para evitar el error de Índices de Firestore
    const q = collection(db, 'consultas');
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs: Consulta[] = [];
      snapshot.forEach(d => docs.push({ id: d.id, ...d.data() } as Consulta));

      // 🚀 MAGIA: Filtramos y ordenamos los datos en la memoria del navegador
      const pendientes = docs
        .filter(d => d.status === 'pending')
        .sort((a, b) => {
            const timeA = a.timestamp?.seconds || 0;
            const timeB = b.timestamp?.seconds || 0;
            return timeB - timeA; // Orden descendente (más nuevos primero)
        });

      setConsultas(pendientes);
    }, (error) => {
        console.error("Error real de Firebase:", error);
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
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-red-100 rounded-xl text-red-600">
            <MessageSquareWarning size={28} />
        </div>
        <div>
            <h1 className="text-2xl font-bold text-gray-900">Consultas Derivadas</h1>
            <p className="text-gray-500">Peticiones especiales escaladas por el Bot Sofía</p>
        </div>
      </div>

      {consultas.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-sm">
            <CheckCircle className="mx-auto text-green-400 mb-4" size={48} />
            <h3 className="text-xl font-bold text-gray-800">Todo bajo control</h3>
            <p className="text-gray-500">No hay consultas pendientes en este momento.</p>
        </div>
      ) : (
        <div className="grid gap-4">
            {consultas.map(consulta => (
                <div key={consulta.id} className="bg-white rounded-2xl border-l-4 border-red-500 shadow-md p-5 flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
                    
                    <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                            <span className="bg-red-50 text-red-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                                <Clock size={14} /> Nueva Consulta
                            </span>
                            <span className="text-gray-400 text-sm">Reserva #{consulta.booking_id}</span>
                        </div>
                        
                        <div className="flex items-center gap-2 mb-4">
                            <Building2 size={18} className="text-gray-400" />
                            <h3 className="font-bold text-gray-900 text-lg">{consulta.room_name}</h3>
                            <span className="text-gray-500 font-medium ml-2">- {consulta.guest_name}</span>
                        </div>

                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 mb-3">
                            <p className="text-sm text-gray-500 mb-1 font-bold">El huésped pidió:</p>
                            <p className="text-gray-900 italic font-medium">"{consulta.mensaje_usuario}"</p>
                        </div>
                        
                        <div className="pl-2 border-l-2 border-brand-200">
                            <p className="text-xs text-brand-600 font-bold mb-1">Sofía respondió:</p>
                            <p className="text-sm text-gray-600">"{consulta.respuesta_bot}"</p>
                        </div>
                    </div>

                    <button 
                        onClick={() => marcarResuelto(consulta.id)}
                        className="bg-green-50 hover:bg-green-500 hover:text-white text-green-700 font-bold py-3 px-6 rounded-xl transition-all border border-green-200 shadow-sm whitespace-nowrap active:scale-95"
                    >
                        Marcar como Resuelto
                    </button>
                </div>
            ))}
        </div>
      )}
    </div>
  );
};
