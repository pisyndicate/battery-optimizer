import React from 'react';

const AffiliateAllocations = ({ locations, onAffiliateClick }) => {
    // 1. Aggregate Data
    const affiliateData = locations.reduce((acc, loc) => {
        loc.allocations.forEach(alloc => {
            if (!acc[alloc.affiliate]) {
                acc[alloc.affiliate] = {
                    name: alloc.affiliate,
                    totalBatteries: 0,
                    totalClients: 0,
                    locations: {} // { locationId: { name, batteries, count, clients: [] } }
                };
            }

            const aff = acc[alloc.affiliate];
            aff.totalBatteries += alloc.amount;
            aff.totalClients += 1;

            if (!aff.locations[loc.id]) {
                aff.locations[loc.id] = { name: loc.name, batteries: 0, count: 0, clients: [] };
            }
            aff.locations[loc.id].batteries += alloc.amount;
            aff.locations[loc.id].count += 1;
            aff.locations[loc.id].clients.push(alloc);
        });
        return acc;
    }, {});

    const sortedAffiliates = Object.values(affiliateData).sort((a, b) => b.totalBatteries - a.totalBatteries);

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '16px' }}>
            {sortedAffiliates.map(aff => (
                <div
                    key={aff.name}
                    onClick={() => onAffiliateClick && onAffiliateClick(aff)}
                    style={{
                        border: '1px solid #dee2e6',
                        borderRadius: '8px',
                        padding: '16px',
                        backgroundColor: '#fff',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                        cursor: 'pointer',
                        transition: 'transform 0.2s, box-shadow 0.2s'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#0056b3' }}>{aff.name}</h3>
                        <span style={{ fontSize: '0.9em', fontWeight: 'bold', color: '#495057' }}>{aff.totalBatteries.toLocaleString()}</span>
                    </div>

                    <div style={{ fontSize: '0.9em', color: '#666', marginBottom: '12px' }}>
                        {aff.totalClients} Clients across {Object.keys(aff.locations).length} Locations
                    </div>

                    <div style={{ maxHeight: '300px', overflowY: 'auto', borderTop: '1px solid #eee', paddingTop: '8px' }}>
                        <table style={{ width: '100%', fontSize: '0.9em', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ textAlign: 'left', borderBottom: '1px solid #eee' }}>
                                    <th style={{ padding: '4px', fontWeight: '600' }}>Location</th>
                                    <th style={{ padding: '4px', fontWeight: '600', textAlign: 'right' }}>Units</th>
                                    <th style={{ padding: '4px', fontWeight: '600', textAlign: 'right' }}>Clients</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Object.values(aff.locations).sort((a, b) => b.batteries - a.batteries).map(loc => (
                                    <tr key={loc.name} style={{ borderBottom: '1px solid #f8f9fa' }}>
                                        <td style={{ padding: '4px 4px 4px 0', color: '#333' }}>{loc.name}</td>
                                        <td style={{ padding: '4px', textAlign: 'right', fontFamily: 'monospace' }}>{loc.batteries.toLocaleString()}</td>
                                        <td style={{ padding: '4px', textAlign: 'right', color: '#666' }}>{loc.count}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default AffiliateAllocations;
