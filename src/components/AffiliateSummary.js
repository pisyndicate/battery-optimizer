import React, { useMemo } from 'react';
import { useToast } from '@/contexts/ToastContext';

const AffiliateSummary = ({ locations }) => {
    const { showToast } = useToast();

    // Process data into a matrix format
    const matrix = useMemo(() => {
        // 1. Identify all unique affiliates and calculate their total allocations across all locations
        const affiliateTotals = {};
        const allAffiliates = new Set();

        locations.forEach(loc => {
            if (loc.allocations) {
                loc.allocations.forEach(alloc => {
                    if (!alloc.affiliate) return;
                    allAffiliates.add(alloc.affiliate);
                    affiliateTotals[alloc.affiliate] = (affiliateTotals[alloc.affiliate] || 0) + alloc.amount;
                });
            }
        });

        // Sort affiliates by total allocated batteries (descending)
        const sortedAffiliates = Array.from(allAffiliates).sort((a, b) => {
            return affiliateTotals[b] - affiliateTotals[a];
        });

        // 2. Build rows for each location
        const rows = locations.map(loc => {
            const row = {
                id: loc.id,
                name: loc.name,
                capacity: loc.originalCapacity || loc.capacity,
                remaining: loc.remainingCapacity,
                affiliateCounts: {},
                uniqueAffiliates: new Set(),
                totalAllocated: 0
            };

            if (loc.allocations) {
                loc.allocations.forEach(alloc => {
                    if (!alloc.affiliate) return;
                    row.affiliateCounts[alloc.affiliate] = (row.affiliateCounts[alloc.affiliate] || 0) + alloc.amount;
                    row.uniqueAffiliates.add(alloc.affiliate);
                    row.totalAllocated += alloc.amount;
                });
            }
            return row;
        });

        // 3. Compute Column Totals
        const columnTotals = {};
        sortedAffiliates.forEach(aff => {
            columnTotals[aff] = 0;
            // Also count how many locations this affiliate is in for the bottom row
            columnTotals[`${aff}_loc_count`] = 0;
        });

        let grandTotalAllocated = 0;
        let grandTotalCapacity = 0;
        let grandTotalRemaining = 0;

        rows.forEach(row => {
            grandTotalAllocated += row.totalAllocated;
            grandTotalCapacity += row.capacity;
            grandTotalRemaining += row.remaining;

            sortedAffiliates.forEach(aff => {
                if (row.affiliateCounts[aff]) {
                    columnTotals[aff] += row.affiliateCounts[aff];
                    columnTotals[`${aff}_loc_count`] += 1;
                }
            });
        });

        return {
            affiliates: sortedAffiliates,
            rows,
            columnTotals,
            grandTotalAllocated,
            grandTotalCapacity,
            grandTotalRemaining
        };
    }, [locations]);

    const handleExport = () => {
        // Headers
        const headers = [
            'RE Short (ID)',
            'Short Name',
            'Total Installed',
            ...matrix.affiliates,
            'To Be Allocated',
            'Affiliate Count'
        ];

        const csvRows = [headers.join(',')];

        // Data Rows
        matrix.rows.forEach(row => {
            const rowData = [
                row.id,
                `"${row.name}"`, // Quote name in case of commas
                row.capacity,
                ...matrix.affiliates.map(aff => row.affiliateCounts[aff] || ''),
                row.remaining,
                row.uniqueAffiliates.size
            ];
            csvRows.push(rowData.join(','));
        });

        // Totals Row
        const totalsData = [
            'TOTALS',
            '',
            matrix.grandTotalCapacity,
            ...matrix.affiliates.map(aff => matrix.columnTotals[aff]),
            matrix.grandTotalRemaining,
            ''
        ];
        csvRows.push(totalsData.join(','));

        // Location Counts Row
        const locCountsData = [
            'Location Count',
            '',
            matrix.rows.length,
            ...matrix.affiliates.map(aff => matrix.columnTotals[`${aff}_loc_count`]),
            '',
            ''
        ];
        csvRows.push(locCountsData.join(','));

        const csvContent = csvRows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `allocation_matrix_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast('Matrix exported to CSV', 'success');
    };

    if (locations.length === 0) return null;

    return (
        <div style={{
            backgroundColor: 'var(--color-surface)',
            borderRadius: '12px',
            border: '1px solid var(--color-border)',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            flexDirection: 'column',
            height: 'calc(100vh - 140px)', // Consistent height
            overflow: 'hidden'
        }}>
            {/* Header */}
            <div style={{
                padding: '20px 24px',
                borderBottom: '1px solid var(--color-border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: 'var(--color-surface)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        backgroundColor: '#eff6ff',
                        color: 'var(--color-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.2rem'
                    }}>
                        📊
                    </div>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '600', color: 'var(--color-text-primary)' }}>
                            Allocation Matrix
                        </h3>
                        <p style={{ margin: '2px 0 0 0', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                            Detailed breakdown of batteries by location and affiliate
                        </p>
                    </div>
                </div>

                <button
                    onClick={handleExport}
                    className="btn"
                    style={{
                        padding: '8px 16px',
                        fontSize: '0.85rem',
                        fontWeight: '500',
                        backgroundColor: '#fff',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-primary)',
                        gap: '8px',
                        transition: 'all 0.2s ease',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.borderColor = 'var(--color-primary)';
                        e.currentTarget.style.color = 'var(--color-primary)';
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.borderColor = 'var(--color-border)';
                        e.currentTarget.style.color = 'var(--color-text-primary)';
                    }}
                >
                    <span>⬇</span> Export CSV
                </button>
            </div>

            {/* Table Container */}
            <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
                <table style={{
                    width: '100%',
                    borderCollapse: 'separate',
                    borderSpacing: 0,
                    fontSize: '0.85rem',
                    minWidth: 'max-content'
                }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 20 }}>
                        <tr>
                            <th style={{ ...headerStyle, position: 'sticky', left: 0, zIndex: 22, width: '220px', minWidth: '220px', maxWidth: '220px', borderRight: '1px solid var(--color-border)' }}>Location</th>
                            <th style={{ ...headerStyle, position: 'sticky', left: '220px', zIndex: 22, width: '100px', minWidth: '100px', maxWidth: '100px', textAlign: 'right', borderRight: '1px solid var(--color-border)', boxShadow: '4px 0 8px -4px rgba(0,0,0,0.05)' }}>Capacity</th>
                            {matrix.affiliates.map(aff => (
                                <th key={aff} style={{ ...headerStyle, minWidth: '140px', maxWidth: '200px', whiteSpace: 'normal', verticalAlign: 'bottom' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <span style={{ lineHeight: '1.2' }}>{aff}</span>
                                        <span style={{ fontSize: '0.85em', opacity: 0.6, fontWeight: '500' }}>
                                            {matrix.columnTotals[aff]?.toLocaleString()} total
                                        </span>
                                    </div>
                                </th>
                            ))}
                            <th style={{ ...headerStyle, minWidth: '100px', backgroundColor: '#fffbeb', color: '#92400e', textAlign: 'right' }}>Remaining</th>
                            <th style={{ ...headerStyle, minWidth: '80px', textAlign: 'center' }}>Affiliates</th>
                        </tr>
                    </thead>
                    <tbody>
                        {matrix.rows.map((row, idx) => (
                            <tr key={row.id} style={{ transition: 'background-color 0.1s' }}>
                                {/* Sticky Column 1: Location */}
                                <td style={{ ...cellStyle, position: 'sticky', left: 0, zIndex: 10, width: '220px', minWidth: '220px', maxWidth: '220px', backgroundColor: idx % 2 === 0 ? '#fff' : '#f8fafc', borderRight: '1px solid var(--color-border)', fontWeight: '500', color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {row.name}
                                </td>

                                {/* Sticky Column 2: Capacity */}
                                <td style={{ ...cellStyle, position: 'sticky', left: '220px', zIndex: 10, width: '100px', minWidth: '100px', maxWidth: '100px', backgroundColor: idx % 2 === 0 ? '#fff' : '#f8fafc', borderRight: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', textAlign: 'right', boxShadow: '4px 0 8px -4px rgba(0,0,0,0.05)' }}>
                                    {row.capacity.toLocaleString()}
                                </td>

                                {/* Data Columns */}
                                {matrix.affiliates.map(aff => {
                                    const val = row.affiliateCounts[aff];
                                    return (
                                        <td key={aff} style={{
                                            ...cellStyle,
                                            color: val ? 'var(--color-text-primary)' : 'transparent',
                                            fontWeight: val ? '600' : 'normal',
                                            backgroundColor: val ? 'rgba(37, 99, 235, 0.04)' : 'inherit'
                                        }}>
                                            {val ? val.toLocaleString() : ''}
                                        </td>
                                    );
                                })}
                                <td style={{ ...cellStyle, backgroundColor: row.remaining < 0 ? '#fef2f2' : (row.remaining > 0 ? '#fffbeb' : 'transparent'), color: row.remaining < 0 ? '#ef4444' : (row.remaining > 0 ? '#b45309' : '#10b981'), fontWeight: '600', textAlign: 'right' }}>
                                    {row.remaining > 0 ? `+${row.remaining.toLocaleString()}` : row.remaining.toLocaleString()}
                                </td>
                                <td style={{ ...cellStyle, color: 'var(--color-text-secondary)', textAlign: 'center' }}>
                                    {row.uniqueAffiliates.size > 0 && (
                                        <span style={{
                                            padding: '2px 8px',
                                            borderRadius: '12px',
                                            backgroundColor: '#f1f5f9',
                                            fontSize: '0.75rem'
                                        }}>
                                            {row.uniqueAffiliates.size}
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 20 }}>
                        <tr style={{ backgroundColor: '#f8fafc', fontWeight: '600', boxShadow: '0 -2px 10px rgba(0,0,0,0.05)' }}>
                            <td style={{ ...footerStyle, position: 'sticky', left: 0, zIndex: 22, width: '220px', minWidth: '220px', maxWidth: '220px', backgroundColor: '#f8fafc', borderRight: '1px solid var(--color-border)' }}>TOTALS</td>
                            <td style={{ ...footerStyle, position: 'sticky', left: '220px', zIndex: 22, width: '100px', minWidth: '100px', maxWidth: '100px', backgroundColor: '#f8fafc', borderRight: '1px solid var(--color-border)', textAlign: 'right', boxShadow: '4px 0 8px -4px rgba(0,0,0,0.05)' }}>{matrix.grandTotalCapacity.toLocaleString()}</td>
                            {matrix.affiliates.map(aff => (
                                <td key={aff} style={{ ...footerStyle, color: 'var(--color-primary)' }}>{matrix.columnTotals[aff].toLocaleString()}</td>
                            ))}
                            <td style={{ ...footerStyle, color: matrix.grandTotalRemaining < 0 ? '#ef4444' : '#b45309', textAlign: 'right' }}>{matrix.grandTotalRemaining.toLocaleString()}</td>
                            <td style={{ ...footerStyle }}></td>
                        </tr>
                        <tr style={{ backgroundColor: '#fff', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                            <td style={{ ...footerStyle, position: 'sticky', left: 0, zIndex: 22, width: '220px', minWidth: '220px', maxWidth: '220px', backgroundColor: '#fff', borderRight: '1px solid var(--color-border)', borderTop: 'none' }}>Locations</td>
                            <td style={{ ...footerStyle, position: 'sticky', left: '220px', zIndex: 22, width: '100px', minWidth: '100px', maxWidth: '100px', backgroundColor: '#fff', borderRight: '1px solid var(--color-border)', borderTop: 'none', textAlign: 'right', boxShadow: '4px 0 8px -4px rgba(0,0,0,0.05)' }}>{matrix.rows.length}</td>
                            {matrix.affiliates.map(aff => (
                                <td key={aff} style={{ ...footerStyle, borderTop: 'none' }}>{matrix.columnTotals[`${aff}_loc_count`]} sites</td>
                            ))}
                            <td style={{ ...footerStyle, borderTop: 'none' }}></td>
                            <td style={{ ...footerStyle, borderTop: 'none' }}></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
};

// Styles
const headerStyle = {
    padding: '16px 12px',
    backgroundColor: '#f8fafc',
    color: 'var(--color-text-secondary)',
    fontWeight: '600',
    textAlign: 'left',
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderBottom: '1px solid var(--color-border)',
    borderTop: '1px solid var(--color-border)',
    whiteSpace: 'nowrap'
};

const cellStyle = {
    padding: '12px 12px',
    borderBottom: '1px solid var(--color-border)',
    fontSize: '0.85rem',
    fontVariantNumeric: 'tabular-nums'
};

const footerStyle = {
    padding: '16px 12px',
    textAlign: 'left',
    borderTop: '2px solid var(--color-border)',
    fontVariantNumeric: 'tabular-nums'
};

export default AffiliateSummary;
