'use client';
import React, { useMemo } from 'react';
import { INITIAL_LOCATIONS, INITIAL_CLIENTS } from '@/lib/data';
import { allocateBatteries } from '@/lib/optimizer';

export default function PrintPage() {
    // Always use the non-scaled counts for the base list? 
    // User probably wants the FINAL (Scaled) list if they have been using that feature.
    // But for a static print view, let's default to the Raw counts unless we pass a param?
    // Use raw for now to match the "18112" vs "18681" unless I want to duplicate logic.
    // Actually, let's just use the logic with default (raw). 
    // If the user wants the scaled numbers printed, they might need the toggle.
    // I'll add a simple toggle for print view too, default to true (Scaled) since that's the goal?
    // Let's stick to RAW first to be safe, or just provide the logic to Scaled since the target is 18681.

    // Use raw for transparency of "Original Data"
    const locations = useMemo(() => INITIAL_LOCATIONS, []);

    // For print view, let's do the Allocation.
    const { locations: allocatedLocations } = useMemo(() => {
        return allocateBatteries(INITIAL_CLIENTS, locations);
    }, [locations]);

    return (
        <div style={{ padding: '24px', fontFamily: 'sans-serif', color: '#000' }}>
            <header style={{ marginBottom: '24px', borderBottom: '2px solid #000', paddingBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
                <h1 style={{ fontSize: '24px', margin: 0 }}>Allocation Manifest</h1>
                <span>Total Locations: {allocatedLocations.length}</span>
            </header>

            <div className="location-list">
                {allocatedLocations.map(loc => {
                    const currentTotal = loc.allocations.reduce((sum, a) => sum + a.amount, 0);
                    // Sort allocations by Affiliate Name then Client Name
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
