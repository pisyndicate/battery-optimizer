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
                        <div key={loc.id} style={{ breakInside: 'avoid', marginBottom: '32px', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', backgroundColor: '#fff' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #1e293b', paddingBottom: '12px', marginBottom: '16px' }}>
                                <h2 style={{ fontSize: '18px', margin: 0, color: '#0f172a' }}>{loc.name} <span style={{ color: '#64748b', fontSize: '14px', fontWeight: 'normal' }}>({loc.id})</span></h2>
                                <div>
                                    <strong style={{ fontSize: '16px' }}>{currentTotal.toLocaleString()} / {loc.capacity.toLocaleString()}</strong>
                                    <span style={{ marginLeft: '12px', fontSize: '14px', color: loc.remainingCapacity > 0 ? '#166534' : '#991b1b', backgroundColor: loc.remainingCapacity > 0 ? '#dcfce7' : '#fee2e2', padding: '2px 8px', borderRadius: '4px' }}>
                                        {loc.remainingCapacity > 0 ? `Rem: ${loc.remainingCapacity.toLocaleString()}` : 'Full'}
                                    </span>
                                </div>
                            </div>

                            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #cbd5e1', textAlign: 'left', backgroundColor: '#f1f5f9' }}>
                                        <th style={{ padding: '8px', color: '#475569', width: '25%' }}>Location</th>
                                        <th style={{ padding: '8px', color: '#475569', width: '25%' }}>Affiliate</th>
                                        <th style={{ padding: '8px', color: '#475569', width: '35%' }}>Client</th>
                                        <th style={{ padding: '8px', color: '#475569', width: '15%', textAlign: 'right' }}>Units</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedAllocations.length === 0 ? (
                                        <tr><td colSpan="4" style={{ padding: '12px', textAlign: 'center', fontStyle: 'italic', color: '#94a3b8' }}>No allocations</td></tr>
                                    ) : (
                                        sortedAllocations.map((alloc, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                                                <td style={{ padding: '8px 8px', color: '#64748b', fontWeight: '500' }}>{loc.name}</td>
                                                <td style={{ padding: '8px 8px' }}>{alloc.affiliate}</td>
                                                <td style={{ padding: '8px 8px', fontWeight: '500' }}>{alloc.clientName}</td>
                                                <td style={{ padding: '8px 8px', textAlign: 'right', fontFamily: 'monospace', fontSize: '14px' }}>{alloc.amount}</td>
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
            body { 
                margin: 0; 
                padding: 0; 
                background: white; 
                color: black;
                font-size: 12pt;
            }
            button { display: none !important; }
            .location-list > div {
                break-inside: avoid;
                page-break-inside: avoid;
                border: 1px solid #ccc !important;
                margin-bottom: 2cm;
            }
            table { width: 100%; }
            thead { display: table-header-group; }
            tr { break-inside: avoid; page-break-inside: avoid; }
            h1 { font-size: 18pt; }
            h2 { font-size: 14pt; }
        }
      `}</style>
        </div>
    );
}
