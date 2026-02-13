import React, { useMemo } from 'react';
import { getAffiliateColor } from '@/lib/theme';
import { useToast } from '@/contexts/ToastContext';

const AffiliateSummary = ({ locations }) => {
    const { showToast } = useToast();
    const summary = useMemo(() => {
        const affiliateMap = {}; // affiliate -> Set(locationId)

        locations.forEach(loc => {
            // Check for valid allocations array
            if (loc.allocations && Array.isArray(loc.allocations)) {
                loc.allocations.forEach(alloc => {
                    const aff = alloc.affiliate;
                    if (!aff) return;

                    if (!affiliateMap[aff]) {
                        affiliateMap[aff] = new Set();
                    }
                    affiliateMap[aff].add(loc.id); // Track unique location IDs
                });
            }
        });

        // Convert to array and sort
        return Object.entries(affiliateMap)
            .map(([name, locSet]) => ({
                name,
                count: locSet.size
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [locations]);

    const handleExport = () => {
        const headers = ['Affiliate Name', 'Location Count'];
        const rows = [headers.join(',')];

        summary.forEach(item => {
            rows.push(`"${item.name}",${item.count}`);
        });

        const csvContent = rows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `affiliate_summary_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast('Affiliate summary exported', 'success');
    };

    if (summary.length === 0) return null;

    return (
        <div className="card" style={{ marginBottom: '24px', padding: '0' }}>
            <div style={{
                padding: '16px 20px',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                backgroundColor: 'rgba(255,255,255,0.02)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--color-text-primary)' }}>Affiliate Location Count</h3>
                <button
                    onClick={handleExport}
                    className="btn"
                    style={{
                        padding: '4px 12px',
                        fontSize: '0.75rem',
                        backgroundColor: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: 'pointer'
                    }}
                    title="Export Summary CSV"
                >
                    <span>⬇</span> CSV
                </button>
            </div>
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
                    <tbody>
                        {summary.map((item, index) => (
                            <tr key={item.name} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <td style={{ padding: '12px 20px', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: getAffiliateColor(item.name) }}></span>
                                    {item.name}
                                </td>
                                <td style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>
                                    {item.count}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AffiliateSummary;
