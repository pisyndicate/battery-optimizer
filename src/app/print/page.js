'use client';
import React, { useMemo, useCallback } from 'react';
import { INITIAL_LOCATIONS, INITIAL_CLIENTS } from '@/lib/data';
import { allocateBatteries } from '@/lib/optimizer';

export default function PrintPage() {
    const [state, setState] = React.useState(null);

    React.useEffect(() => {
        const saved = localStorage.getItem('optimizer-transient-state');
        if (saved) {
            setState(JSON.parse(saved));
        }
    }, []);

    const locations = useMemo(() => state?.customData?.locations || INITIAL_LOCATIONS, [state]);
    const clients = useMemo(() => {
        let baseClients = state?.customData?.clients || INITIAL_CLIENTS;
        if (state?.useAdjustedCounts) {
            const totalCapacity = locations.reduce((sum, l) => sum + l.capacity, 0);
            const targetTotalAttributes = totalCapacity * (state.targetUtilization / 100);
            const { adjustClientCounts } = require('@/lib/optimizer');
            return adjustClientCounts(baseClients, Math.floor(targetTotalAttributes));
        }
        return baseClients;
    }, [state, locations]);

    const { locations: allocatedLocations } = useMemo(() => {
        const effectiveTolerance = state ? Math.max(0, 100 - state.targetUtilization) : 0;
        return allocateBatteries(
            clients,
            locations,
            state?.exclusiveAffiliates || [],
            state?.pinnedAllocations || [],
            effectiveTolerance,
            0
        );
    }, [clients, locations, state]);

    const handleExportCSV = useCallback(() => {
        const headers = ['Location Name', 'Location Capacity', 'Client Name', 'Affiliate', 'Batteries'];
        const rows = [headers.join(',')];

        allocatedLocations.forEach(loc => {
            loc.allocations.forEach(alloc => {
                const safeLoc = `"${loc.name.replace(/"/g, '""')}"`;
                const safeClient = `"${alloc.clientName.replace(/"/g, '""')}"`;
                const safeAffiliate = `"${alloc.affiliate.replace(/"/g, '""')}"`;
                rows.push(`${safeLoc},${loc.capacity},${safeClient},${safeAffiliate},${alloc.amount}`);
            });
        });

        const csvContent = rows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `battery_manifest_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }, [allocatedLocations]);

    return (
        <div style={{ padding: '24px', fontFamily: 'sans-serif', color: '#000' }}>
            <header style={{ marginBottom: '24px', borderBottom: '2px solid #000', paddingBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 style={{ fontSize: '24px', margin: 0 }}>Allocation Manifest</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <span>Total Locations: {allocatedLocations.length}</span>
                    <button
                        onClick={handleExportCSV}
                        style={{
                            padding: '8px 16px',
                            backgroundColor: '#2563eb',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        ⬇ Export CSV
                    </button>
                    <button
                        onClick={() => window.print()}
                        style={{
                            padding: '8px 16px',
                            backgroundColor: '#1e293b',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        🖨️ Print
                    </button>
                </div>
            </header>

            <div className="location-list">
                {allocatedLocations.map(loc => {
                    const currentTotal = loc.allocations.reduce((sum, a) => sum + a.amount, 0);
                    const sortedAllocations = [...loc.allocations].sort((a, b) => {
                        if (a.affiliate < b.affiliate) return -1;
                        if (a.affiliate > b.affiliate) return 1;
                        return a.clientName.localeCompare(b.clientName);
                    });

                    return (
                        <div key={loc.id} style={{ breakInside: 'avoid', marginBottom: '32px', border: '1px solid #ccc', padding: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #000', paddingBottom: '8px', marginBottom: '8px' }}>
                                <h2 style={{ fontSize: '18px', margin: 0 }}>{loc.name} ({loc.id})</h2>
                                <div>
                                    <strong>{currentTotal.toLocaleString()} / {loc.capacity.toLocaleString()}</strong>
                                    <span style={{ marginLeft: '12px', fontSize: '0.9em', color: loc.remainingCapacity > 0 ? '#000' : '#666' }}>
                                        (Rem: {loc.remainingCapacity.toLocaleString()})
                                    </span>
                                </div>
                            </div>

                            <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #999', textAlign: 'left' }}>
                                        <th style={{ padding: '4px' }}>Affiliate</th>
                                        <th style={{ padding: '4px' }}>Client</th>
                                        <th style={{ padding: '4px', textAlign: 'right' }}>Units</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedAllocations.length === 0 ? (
                                        <tr><td colSpan="3" style={{ padding: '8px', textAlign: 'center', fontStyle: 'italic' }}>Empty</td></tr>
                                    ) : (
                                        sortedAllocations.map((alloc, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                                                <td style={{ padding: '4px' }}>{alloc.affiliate}</td>
                                                <td style={{ padding: '4px' }}>{alloc.clientName}</td>
                                                <td style={{ padding: '4px', textAlign: 'right' }}>{alloc.amount}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    );
                })}
            </div>

            <style jsx global>{`
        @media print {
            body { margin: 0; padding: 0; }
            button { display: none; }
        }
      `}</style>
        </div>
    );
}
