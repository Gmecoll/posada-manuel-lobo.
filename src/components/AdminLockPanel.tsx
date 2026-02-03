'use client';

import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { Lock, Unlock, RefreshCw, Battery, Signal, WifiOff, Fingerprint } from 'lucide-react';
import { functions } from '@/firebaseConfig';

const AdminLockPanel = () => {
  const [locks, setLocks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  // 1. Función para obtener la lista de cerraduras
  const fetchLocks = async () => {
    setLoading(true);
    const listarCerraduras = httpsCallable(functions, 'listarCerradurasTTLock');
    try {
      const result: any = await listarCerraduras();
      if (result.data.success) {
        setLocks(result.data.locks);
        console.log("Cerraduras cargadas:", result.data.locks);
      } else {
        alert("Error de TTLock: " + result.data.error);
      }
    } catch (error: any) {
      console.error("Error cargando cerraduras:", error);
      alert("Error de conexión: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // 2. Función para abrir una cerradura específica
  const handleUnlock = async (lockId: number) => {
    setActionLoading(lockId);
    const abrirPuerta = httpsCallable(functions, 'abrirCerraduraRemote');
    try {
      const result: any = await abrirPuerta({ lockId });
      if (result.data.success) {
        alert("✅ Puerta abierta con éxito");
      } else {
        alert("❌ Error: " + result.data.error);
      }
    } catch (error: any) {
      alert("Error en el servidor: " + error.message);
    } finally {
      setActionLoading(null);
    }
  };

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
        
        <button 
          onClick={fetchLocks}
          disabled={loading}
          className="p-3 bg-white/5 hover:bg-white/10 rounded-full transition-all disabled:opacity-50 group"
          title="Refrescar lista"
        >
          <RefreshCw className={`w-5 h-5 text-cyan-400 ${loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
        </button>
      </div>

      <div className="grid gap-4">
        {locks.length === 0 && !loading && (
          <div className="text-center py-12 border border-dashed border-white/10 rounded-3xl bg-white/[0.02]">
            <p className="text-slate-500 text-sm italic">
              No hay dispositivos detectados.<br/>Pulsaaaa el botón de refrescar para sincronizar.
            </p>
          </div>
        )}

        {locks.map((lock) => (
          <div key={lock.id} className="flex items-center justify-between p-5 bg-slate-950/60 border border-white/5 rounded-2xl hover:border-cyan-500/30 transition-all group">
            <div className="space-y-2">
              <div>
                <h3 className="text-white font-semibold group-hover:text-cyan-400 transition-colors">
                  {lock.nombre}
                </h3>
                {/* ID DE LA CERRADURA VISIBLE AQUÍ */}
                <div className="flex items-center gap-1 mt-1">
                  <Fingerprint className="w-3 h-3 text-slate-600" />
                  <span className="text-[9px] font-mono text-slate-500 tracking-tighter">ID: {lock.id}</span>
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
        ))}
      </div>
      
      {loading && <p className="text-center text-cyan-400 text-[10px] mt-6 tracking-widest animate-pulse font-bold uppercase">Sincronizando con TTLock Cloud...</p>}
    </div>
  );
};

export default AdminLockPanel;