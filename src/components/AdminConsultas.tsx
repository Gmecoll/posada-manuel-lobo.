"use client";

import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { MessageSquareWarning, CheckCircle, Clock, Building2, Send, X } from 'lucide-react';
import { db } from '../firebaseConfig';

interface Consulta {
  id: string;
  booking_id: string;
  guest_name: string;
  room_name: string;
  mensaje_usuario: string;
  respuesta_bot: string;
  status: 'pending' | 'resolved';
  timestamp: any;
  adminResponse?: string;
}

export const AdminConsultas: React.FC = () => {
  const [consultas, setConsultas] = useState<Consulta[]>([]);
  
  // Estados para el Modal
  const [consultaActiva, setConsultaActiva] = useState<Consulta | null>(null);
  const [respuestaAdmin, setRespuestaAdmin] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Escuchamos las consultas pendientes en tiempo real
    const q = collection(db, 'consultas');
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs: Consulta[] = [];
      snapshot.forEach(d => docs.push({ id: d.id, ...d.data() } as Consulta));

      // Filtramos las pendientes y ordenamos por fecha (más recientes arriba)
      const pendientes = docs
        .filter(d => d.status === 'pending')
        .sort((a, b) => {
            const timeA = a.timestamp?.seconds || 0;
            const timeB = b.timestamp?.seconds || 0;
            return timeB - timeA;
        });

      setConsultas(pendientes);
    }, (error) => {
        console.error("Error en Firestore Admin:", error);
    });

    return () => unsubscribe();
  }, []);

  const resolverYResponder = async () => {
      if (!consultaActiva) return;
      setIsSubmitting(true);

      try {
          const updateData: any = { 
            status: 'resolved',
            resolvedAt: serverTimestamp(), // Guardamos cuándo se resolvió
            guestNotified: false // 🚀 CRÍTICO: Esto activa la notificación en el Dashboard del huésped
          };
          
          if (respuestaAdmin.trim() !== "") {
              updateData.adminResponse = respuestaAdmin.trim();
          }

          await updateDoc(doc(db, 'consultas', consultaActiva.id), updateData);
          
          setConsultaActiva(null);
          setRespuestaAdmin("");
      } catch (error) {
          console.error("Error al responder:", error);
          alert("No se pudo enviar la respuesta. Revisa la conexión.");
      } finally {
          setIsSubmitting(false);
      }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto relative">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-red-100 rounded-xl text-red-600">
            <MessageSquareWarning size={28} />
        </div>
        <div>
            <h1 className="text-2xl font-bold text-gray-900">Consultas Derivadas</h1>
            <p className="text-gray-500">Peticiones especiales escaladas por Sofía</p>
        </div>
      </div>

      {consultas.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-sm">
            <CheckCircle className="mx-auto text-green-400 mb-4" size={48} />
            <h3 className="text-xl font-bold text-gray-800">Bandeja de entrada limpia</h3>
            <p className="text-gray-500">No hay consultas pendientes de huéspedes.</p>
        </div>
      ) : (
        <div className="grid gap-4">
            {consultas.map(consulta => (
                <div key={consulta.id} className="bg-white rounded-2xl border-l-4 border-red-500 shadow-md p-5 flex flex-col md:flex-row gap-6 justify-between items-start md:items-center hover:shadow-lg transition-shadow">
                    
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
                            <p className="text-sm text-gray-500 mb-1 font-bold">El huésped preguntó:</p>
                            <p className="text-gray-900 italic font-medium">"{consulta.mensaje_usuario}"</p>
                        </div>
                        
                        <div className="pl-2 border-l-2 border-blue-200">
                            <p className="text-xs text-blue-600 font-bold mb-1">Sofía le dijo:</p>
                            <p className="text-xs text-gray-500 italic">"{consulta.respuesta_bot}"</p>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2 min-w-[160px]">
                        <button 
                            onClick={() => setConsultaActiva(consulta)}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2"
                        >
                            <Send size={18} />
                            Responder
                        </button>
                    </div>
                </div>
            ))}
        </div>
      )}

      {/* MODAL DE RESPUESTA */}
      {consultaActiva && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <div>
                <h3 className="font-black text-xl text-gray-800">Responder a {consultaActiva.guest_name}</h3>
                <p className="text-xs text-gray-500 uppercase tracking-widest font-bold">Habitación {consultaActiva.room_name}</p>
              </div>
              <button 
                onClick={() => { setConsultaActiva(null); setRespuestaAdmin(""); }}
                className="p-2 rounded-full hover:bg-gray-200 text-gray-400 transition-colors"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="p-8">
              <div className="bg-blue-50 text-blue-800 text-sm p-4 rounded-2xl mb-6 border border-blue-100 italic">
                <strong>Huésped:</strong> "{consultaActiva.mensaje_usuario}"
              </div>

              <label className="block text-sm font-black text-gray-700 mb-2 uppercase tracking-wide">
                Tu mensaje de respuesta:
              </label>
              <textarea 
                className="w-full border-2 border-gray-100 bg-gray-50 rounded-2xl p-4 h-40 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none resize-none transition-all text-gray-800 font-medium"
                placeholder="Escribe aquí... (El huésped recibirá una notificación inmediata)"
                value={respuestaAdmin}
                onChange={(e) => setRespuestaAdmin(e.target.value)}
                autoFocus
              ></textarea>
            </div>

            <div className="p-6 border-t border-gray-100 bg-gray-50 flex flex-col sm:flex-row justify-between items-center gap-4">
               <button 
                  onClick={() => { setRespuestaAdmin(""); resolverYResponder(); }}
                  disabled={isSubmitting}
                  className="text-gray-400 hover:text-gray-600 text-xs font-bold uppercase tracking-widest transition-colors"
                >
                  Solo marcar resuelto
                </button>
                <div className="flex gap-3 w-full sm:w-auto">
                  <button 
                    onClick={() => { setConsultaActiva(null); setRespuestaAdmin(""); }}
                    className="flex-1 sm:flex-none px-6 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-200 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={resolverYResponder}
                    disabled={isSubmitting || respuestaAdmin.trim() === ""}
                    className="flex-1 sm:flex-none px-8 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-black shadow-lg shadow-green-600/20 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:grayscale"
                  >
                    {isSubmitting ? <Clock className="animate-spin" size={20} /> : <Send size={20} />}
                    ENVIAR
                  </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};