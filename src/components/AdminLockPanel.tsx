'use client';

import { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { Lock, Unlock, RefreshCw, Battery, Signal, WifiOff, Fingerprint, AlertCircle, CheckCircle2 } from 'lucide-react';
import { functions } from '@/firebaseConfig';

const AdminLockPanel = () => {
  const [locks, setLocks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  
  // 1. Estado para el feedback visual
  const [feedback, setFeedback] = useState<{msg: string, type: 'success' | 'error'} | null>(null);

  useEffect(() => {
    setMounted(true);
    fetchLocks();
  }, []);

  const fetchLocks = async () => {
    setLoading(true);
    setFeedback(null); // Limpiar feedback al refrescar
    try {
      const listarCerraduras = httpsCallable(functions, 'listarCerradurasTTLock');
      const result: any = await listarCerraduras();
      
      if (result.data && result.data.success) {
        const rawList = Array.isArray(result.data.list) ? result.data.list : [];
        const listaMapeada = rawList.map((l: any) => ({
          id: l.lockId,
          nombre: l.lockAlias || l.lockName || "Cerradura Principal",
          bateria: l.electricQuantity || 0,
          online: l.hasGateway === 1 
        }));
        setLocks(listaMapeada);
      } else {
        setFeedback({ msg: "No se pudo sincronizar la lista de cerraduras", type: 'error' });
      }
    } catch (error: any) {
      setFeedback({ msg: "Error de conexión con el servidor", type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleUnlock = async (lockId: number) => {
    setActionLoading(lockId);
    setFeedback(null); // Limpiar mensajes previos antes de la acción
    
    try {
      const abrir = httpsCallable(functions, 'abrirCerraduraRemote');
      const res: any = await abrir({ lockId });
      
      if (res.data && res.data.success) {
        setFeedback({ msg: "✅ Puerta abierta con éxito", type: 'success' });
        // Opcional: Auto-limpiar el éxito después de 5 segundos
        setTimeout(() => setFeedback(null), 5000);
      } else {
        const errorMsg = res.data?.error || "Error desconocido";
        setFeedback({ msg: `❌ Error: ${errorMsg}`, type: 'error' });
      }
    } catch (e: any) {
      setFeedback({ msg: "🔥 Error crítico de red o permisos", type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  if (!mounted) return null;

  return (
    <div className="bg-slate-900/50 border border-white/10 rounded-[2rem] p-8 backdrop-blur-xl shadow-2xl">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Lock className="w-5 h-5 text-cyan-400" /> 
            Panel de Accesos
          </h2>
          <p className="text-slate-400 text-xs mt-1 font-medium uppercase tracking-wider">Posada Manuel Lobo</p>
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={fetchLocks}
            disabled={loading}
            className="p-3 bg-white/5 hover:bg-white/10 rounded-full transition-all disabled:opacity-50 group"
          >
            <RefreshCw className={`w-5 h-5 text-cyan-400 ${loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
          </button>
        </div>
      </div>

      {/* 2. Visualización del Feedback */}
      {feedback && (
        <div className={`mb-6 p-4 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300 border ${
          feedback.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
            : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>
          {feedback.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <span className="text-sm font-medium">{feedback.msg}</span>
          <button onClick={() => setFeedback(null)} className="ml-auto opacity-50 hover:opacity-100 text-xs">esc</button>
        </div>
      )}

      <div className="grid gap-4">
        {locks.length === 0 && !loading ? (
          <div className="text-center py-12 border border-dashed border-white/10 rounded-3xl bg-white/[0.02]">
            <p className="text-slate-500 text-sm italic">
              No hay dispositivos detectados.<br/>
              <span 
                className="text-cyan-500/50 not-italic text-xs font-bold uppercase tracking-widest mt-2 block cursor-pointer hover:text-cyan-400 transition-colors" 
                onClick={fetchLocks}
              >
                Pulsa aquí para sincronizar
              </span>
            </p>
          </div>
        ) : (
          locks.map((lock) => (
            <div key={lock.id} className="flex items-center justify-between p-5 bg-slate-950/60 border border-white/5 rounded-2xl hover:border-cyan-500/30 transition-all group">
              <div className="space-y-2">
                <div>
                  <h3 className="text-white font-semibold group-hover:text-cyan-400 transition-colors">
                    {lock.nombre}
                  </h3>
                  <div className="flex items-center gap-1 mt-1">
                    <Fingerprint className="w-3 h-3 text-slate-600" />
                    <span className="text-[9px] font-mono text-slate-500 tracking-tighter uppercase">ID: {lock.id}</span>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-[10px] uppercase tracking-[0.15em] font-bold">
                  <span className="flex items-center gap-1.5 text-slate-400 bg-white/5 px-2 py-1 rounded-md">
                    <Battery className={`w-3 h-3 ${lock.bateria < 25 ? 'text-red-500 animate-pulse' : 'text-emerald-500'}`} />
                    {lock.bateria}%
                  </span>
                  <span className={`flex items-center gap-1.5 px-2 py-1 rounded-md ${lock.online ? 'text-cyan-400 bg-cyan-400/10' : 'text-slate-500 bg-white/5'}`}>
                    {lock.online ? <Signal className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                    {lock.online ? 'Online' : 'Offline'}
                  </span>
                </div>
              </div>

              <button
                onClick={() => handleUnlock(lock.id)}
                disabled={actionLoading === lock.id || !lock.online}
                className={`relative overflow-hidden flex items-center gap-2 px-6 py-3.5 rounded-xl font-black text-[10px] tracking-widest transition-all
                  ${lock.online 
                    ? 'bg-cyan-500 text-slate-950 hover:bg-cyan-400 hover:scale-105 active:scale-95 shadow-lg shadow-cyan-500/20' 
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
              >
                {actionLoading === lock.id ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Unlock className="w-3.5 h-3.5" />
                )}
                {actionLoading === lock.id ? 'PROCESANDO...' : 'ABRIR AHORA'}
              </button>
            </div>
          ))
        )}
      </div>
      
      {loading && <p className="text-center text-cyan-400 text-[10px] mt-6 tracking-widest animate-pulse font-bold uppercase">Sincronizando cerraduras...</p>}
    </div>
  );
};

export default AdminLockPanel;