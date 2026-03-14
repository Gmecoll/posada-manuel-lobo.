"use client";

import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { 
  MessageSquareWarning, CheckCircle, Clock, Building2, 
  Send, X, History, Inbox, MessageCircle, User 
} from 'lucide-react';
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
  resolvedAt?: any;
}

export const AdminConsultas: React.FC = () => {
  const [consultas, setConsultas] = useState<Consulta[]>([]);
  const [tabActual, setTabActual] = useState<'pendientes' | 'historial'>('pendientes');
  
  const [consultaActiva, setConsultaActiva] = useState<Consulta | null>(null);
  const [respuestaAdmin, setRespuestaAdmin] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const q = collection(db, 'consultas');
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs: Consulta[] = [];
      snapshot.forEach(d => docs.push({ id: d.id, ...d.data() } as Consulta));
      setConsultas(docs);
    }, (error) => {
        console.error("Error en Firestore Admin:", error);
    });

    return () => unsubscribe();
  }, []);

  // Filtramos y ordenamos las consultas según la pestaña activa
  const pendientes = consultas
    .filter(d => d.status === 'pending')
    .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

  const historial = consultas
    .filter(d => d.status === 'resolved')
    .sort((a, b) => (b.resolvedAt?.seconds || b.timestamp?.seconds || 0) - (a.resolvedAt?.seconds || a.timestamp?.seconds || 0));

  const formatFecha = (ts: any) => {
    if (!ts) return "---";
    const date = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
    return date.toLocaleString('es-UY', { 
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
    }) + " hs";
  };

  const resolverYResponder = async () => {
      if (!consultaActiva) return;
      setIsSubmitting(true);
      try {
          const updateData: any = { 
            status: 'resolved',
            resolvedAt: serverTimestamp(),
            guestNotified: false 
          };
          if (respuestaAdmin.trim() !== "") updateData.adminResponse = respuestaAdmin.trim();
          await updateDoc(doc(db, 'consultas', consultaActiva.id), updateData);
          setConsultaActiva(null);
          setRespuestaAdmin("");
      } catch (error) {
          console.error("Error al responder:", error);
          alert("No se pudo enviar la respuesta.");
      } finally {
          setIsSubmitting(false);
      }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto relative min-h-screen">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-brand-100 rounded-2xl text-brand-600 shadow-sm">
              <MessageSquareWarning size={32} />
          </div>
          <div>
              <h1 className="text-2xl font-black text-gray-900 tracking-tight">Centro de Consultas</h1>
              <p className="text-gray-500 text-sm font-medium">Gestión de peticiones de Sky Rooms</p>
          </div>
        </div>

        {/* SELECTOR DE PESTAÑAS (TABS) */}
        <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200 self-start md:self-center">
          <button 
            onClick={() => setTabActual('pendientes')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${tabActual === 'pendientes' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Inbox size={18} /> Pendientes
            {pendientes.length > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full ml-1">{pendientes.length}</span>}
          </button>
          <button 
            onClick={() => setTabActual('historial')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${tabActual === 'historial' ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <History size={18} /> Historial
          </button>
        </div>
      </div>

      {/* CONTENIDO DE PENDIENTES */}
      {tabActual === 'pendientes' && (
        <div className="grid gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          {pendientes.length === 0 ? (
            <div className="bg-white rounded-3xl border-2 border-dashed border-gray-200 p-20 text-center">
                <CheckCircle className="mx-auto text-green-400 mb-4 opacity-50" size={64} />
                <h3 className="text-xl font-bold text-gray-800">¡Bandeja limpia!</h3>
                <p className="text-gray-400">No hay consultas esperando respuesta.</p>
            </div>
          ) : (
            pendientes.map(consulta => (
              <div key={consulta.id} className="bg-white rounded-[2rem] border-l-8 border-red-500 shadow-xl p-6 flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="bg-red-50 text-red-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1 border border-red-100">
                      <Clock size={12} /> Recibida: {formatFecha(consulta.timestamp)}
                    </span>
                    <span className="text-gray-400 text-xs font-bold">RESERVA #{consulta.booking_id}</span>
                  </div>
                  <div className="flex items-center gap-2 mb-4">
                    <Building2 size={20} className="text-gray-400" />
                    <h3 className="font-black text-gray-900 text-xl">{consulta.room_name} <span className="text-gray-400 font-medium ml-2">— {consulta.guest_name}</span></h3>
                  </div>
                  <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 mb-3 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-red-200"></div>
                    <p className="text-xs text-gray-400 font-bold uppercase mb-2 flex items-center gap-1"><User size={12}/> El huésped dice:</p>
                    <p className="text-gray-800 font-semibold text-lg italic">"{consulta.mensaje_usuario}"</p>
                  </div>
                </div>
                <button 
                  onClick={() => setConsultaActiva(consulta)}
                  className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white font-black py-4 px-8 rounded-2xl transition-all shadow-lg shadow-blue-600/20 active:scale-95 flex items-center justify-center gap-3"
                >
                  <Send size={20} /> RESPONDER
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* CONTENIDO DEL HISTORIAL */}
      {tabActual === 'historial' && (
        <div className="grid gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          {historial.length === 0 ? (
            <div className="bg-white rounded-3xl border-2 border-dashed border-gray-200 p-20 text-center">
                <History className="mx-auto text-gray-300 mb-4" size={64} />
                <h3 className="text-xl font-bold text-gray-400">Historial vacío</h3>
                <p className="text-gray-400">Las consultas resueltas aparecerán aquí.</p>
            </div>
          ) : (
            historial.map(consulta => (
              <div key={consulta.id} className="bg-gray-50/50 rounded-3xl border border-gray-200 p-6 opacity-80 hover:opacity-100 transition-opacity">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
                      <CheckCircle size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-900">{consulta.room_name} — {consulta.guest_name}</h4>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">Resuelto el {formatFecha(consulta.resolvedAt)}</p>
                    </div>
                  </div>
                  <span className="text-gray-400 text-xs font-mono bg-white px-3 py-1 rounded-lg border border-gray-100">ID: {consulta.booking_id}</span>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                    <p className="text-[10px] text-gray-400 font-black uppercase mb-2">Consulta original:</p>
                    <p className="text-sm text-gray-600 italic">"{consulta.mensaje_usuario}"</p>
                  </div>
                  <div className="bg-brand-50/50 p-4 rounded-2xl border border-brand-100 shadow-sm">
                    <p className="text-[10px] text-brand-600 font-black uppercase mb-2">Tu respuesta:</p>
                    <p className="text-sm text-gray-900 font-bold">
                      {consulta.adminResponse ? `"${consulta.adminResponse}"` : "Resuelto sin mensaje adicional."}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* MODAL DE RESPUESTA (Igual que el anterior pero con UI mejorada) */}
      {consultaActiva && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <div>
                <h3 className="font-black text-xl text-gray-800 flex items-center gap-2">
                  <MessageCircle className="text-blue-500" /> Responder Consulta
                </h3>
              </div>
              <button onClick={() => { setConsultaActiva(null); setRespuestaAdmin(""); }} className="p-2 rounded-full hover:bg-gray-200 text-gray-400 transition-colors">
                <X size={24} />
              </button>
            </div>
            <div className="p-8">
              <div className="bg-blue-50 text-blue-800 text-sm p-5 rounded-2xl mb-6 border border-blue-100 relative">
                <span className="absolute -top-3 left-4 bg-blue-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full uppercase">Pregunta del Huésped</span>
                <p className="font-bold text-base leading-relaxed">"{consultaActiva.mensaje_usuario}"</p>
              </div>
              <label className="block text-xs font-black text-gray-400 mb-2 uppercase tracking-widest">Escribe tu respuesta personalizada:</label>
              <textarea 
                className="w-full border-2 border-gray-100 bg-gray-50 rounded-2xl p-5 h-44 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none resize-none transition-all text-gray-800 font-medium text-lg"
                placeholder="Ej: ¡Claro! Ya enviamos las toallas..."
                value={respuestaAdmin}
                onChange={(e) => setRespuestaAdmin(e.target.value)}
                autoFocus
              ></textarea>
            </div>
            <div className="p-6 border-t border-gray-100 bg-gray-50 flex flex-col sm:flex-row justify-between items-center gap-4">
               <button onClick={() => { setRespuestaAdmin(""); resolverYResponder(); }} disabled={isSubmitting} className="text-gray-400 hover:text-gray-600 text-xs font-bold uppercase tracking-widest">Solo marcar resuelto</button>
                <div className="flex gap-3 w-full sm:w-auto">
                  <button onClick={() => { setConsultaActiva(null); setRespuestaAdmin(""); }} className="flex-1 sm:flex-none px-6 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-200 transition-colors">Cancelar</button>
                  <button onClick={resolverYResponder} disabled={isSubmitting || respuestaAdmin.trim() === ""} className="flex-1 sm:flex-none px-8 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-black shadow-lg flex items-center justify-center gap-2 disabled:opacity-50">
                    {isSubmitting ? <Clock className="animate-spin" /> : <Send size={20} />} ENVIAR
                  </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};