
import AdminLockPanel from "@/components/AdminLockPanel";
import AccessLogReport from "@/components/AccessLogReport";
import { DoorOpen } from "lucide-react";

export default function MainDoorPage() {
  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-center gap-3 mb-6">
          <DoorOpen className="w-8 h-8 text-slate-700" />
          <h1 className="text-3xl font-bold text-slate-800 font-headline">Puerta Principal</h1>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <AdminLockPanel />
          </div>
          <div className="lg:col-span-2">
            <AccessLogReport />
          </div>
        </div>
      </div>
    </main>
  );
}
