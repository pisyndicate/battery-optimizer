import React, { useMemo } from 'react';

const AffiliateSummary = ({ locations }) => {
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

    if (summary.length === 0) return null;

    return (
        <div style={{
            marginBottom: '24px',
            border: '1px solid #ddd',
            borderRadius: '8px',
            backgroundColor: '#fff',
            overflow: 'hidden'
        }}>
            <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid #eee',
                backgroundColor: '#f8f9fa'
            }}>
                <h3 style={{ margin: 0, fontSize: '1rem', color: '#333' }}>Affiliate Location Count</h3>
            </div>
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
                    <tbody>
                        {summary.map((item, index) => (
                            <tr key={item.name} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                <td style={{ padding: '8px 16px', color: '#333' }}>{item.name}</td>
                                <td style={{ padding: '8px 16px', textAlign: 'right', fontWeight: 'bold', color: '#007bff' }}>
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
