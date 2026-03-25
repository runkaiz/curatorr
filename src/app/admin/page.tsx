"use client";

import { useState } from "react";
import StatsCards from "@/components/admin/StatsCards";
import SyncButton from "@/components/admin/SyncButton";
import LibrarySelector from "@/components/admin/LibrarySelector";
import PruningTable from "@/components/admin/PruningTable";

export default function AdminDashboard() {
  const [refreshKey, setRefreshKey] = useState(0);

  function handleSyncComplete() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-3">
          <LibrarySelector />
          <SyncButton onSyncComplete={handleSyncComplete} />
        </div>
      </div>

      <StatsCards refreshKey={refreshKey} />

      <div>
        <h2 className="mb-3 text-lg font-semibold">Library Items</h2>
        <PruningTable refreshKey={refreshKey} />
      </div>
    </div>
  );
}
