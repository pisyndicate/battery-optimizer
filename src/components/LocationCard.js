import React from 'react';

const LocationCard = ({ location, onDropClients, onCardClick }) => {
    // We must recalculate current total from allocations because remainingCapacity 
    // is now based on effectiveCapacity (tolerance), not total physical capacity.
    // Or we can use location.effectiveCapacity.

    const validAllocations = location.allocations || [];
    const currentTotal = validAllocations.reduce((sum, a) => sum + a.amount, 0);
    const capacityToUse = location.effectiveCapacity || location.capacity;
    const isRestricted = location.effectiveCapacity && location.effectiveCapacity < location.originalCapacity;

    const totalCapacity = location.originalCapacity || location.capacity;

    // Calculate percentages relative to the Total Physical Capacity
    const usagePercentage = (currentTotal / totalCapacity) * 100;
    const targetPercentage = (capacityToUse / totalCapacity) * 100;
    const isOverTarget = currentTotal > capacityToUse;

    // Group allocations by Affiliate for display
    const byAffiliate = {};
    validAllocations.forEach(alloc => {
        if (!byAffiliate[alloc.affiliate]) {
            byAffiliate[alloc.affiliate] = { count: 0, batteries: 0, clients: [] };
        }
        byAffiliate[alloc.affiliate].count++;
        byAffiliate[alloc.affiliate].batteries += alloc.amount;
    });

    const [isDragOver, setIsDragOver] = React.useState(false);

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragOver(true);
    };

    const handleDragLeave = () => {
        setIsDragOver(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragOver(false);
        try {
            const data = JSON.parse(e.dataTransfer.getData('application/json'));
            if (data.type === 'CLIENT_DRAG' && onDropClients) {
                onDropClients(location.id, data.clients);
            }
        } catch (err) {
            console.error('Failed to parse drop data', err);
        }
    };

    return (
        <div
            onClick={onCardClick}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{
                border: isDragOver ? '2px dashed #007bff' : '1px solid #ddd',
                borderRadius: '8px',
                padding: '16px',
                margin: '0',
                backgroundColor: isDragOver ? '#f0f8ff' : '#fff',
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                display: 'flex',
                cursor: 'pointer',
                flexDirection: 'column',
                transition: 'all 0.2s ease'
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{location.name}</h3>
                <span style={{ fontSize: '0.85em', color: '#666', fontFamily: 'monospace' }}>{location.id}</span>
            </div>

            <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85em', marginBottom: '4px' }}>
                    <span>Used: {currentTotal.toLocaleString()}</span>
                    <span>Max: {location.capacity.toLocaleString()}</span>
                </div>
                {isRestricted && (
                    <div style={{ fontSize: '0.8em', color: '#dc3545', textAlign: 'right', marginBottom: '2px' }}>
                        Target Cap: {capacityToUse.toLocaleString()}
                    </div>
                )}
                <div style={{ marginBottom: '6px', fontSize: '0.9em', fontWeight: 'bold', color: location.remainingCapacity > 0 ? '#28a745' : '#6c757d', textAlign: 'right' }}>
                    Remaining: {location.remainingCapacity.toLocaleString()}
                </div>
                <div style={{
                    height: '12px',
                    backgroundColor: '#e9ecef',
                    borderRadius: '6px',
                    position: 'relative',
                    overflow: 'hidden'
                }}>
                    {/* Usage Bar */}
                    <div style={{
                        width: `${Math.min(usagePercentage, 100)}%`,
                        backgroundColor: isOverTarget ? '#dc3545' : '#007bff',
                        height: '100%',
                        transition: 'width 0.3s ease',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        zIndex: 1
                    }} />

                    {/* Target Line Marker */}
                    {isRestricted && (
                        <div style={{
                            position: 'absolute',
                            left: `${Math.min(targetPercentage, 100)}%`,
                            top: 0,
                            bottom: 0,
                            width: '2px',
                            backgroundColor: '#dc3545', // Red line
                            zIndex: 2,
                            boxShadow: '0 0 2px rgba(0,0,0,0.5)'
                        }} title={`Target: ${capacityToUse.toLocaleString()}`} />
                    )}
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', maxHeight: '300px', borderTop: '1px solid #eee', paddingTop: '8px' }}>
                {Object.keys(byAffiliate).length === 0 ? (
                    <div style={{ fontStyle: 'italic', color: '#999', fontSize: '0.85em' }}>Empty</div>
                ) : (
                    <ul style={{ listStyle: 'none', padding: 0 }}>
                        {Object.entries(byAffiliate).sort((a, b) => b[1].batteries - a[1].batteries).map(([affName, stats]) => (
                            <li key={affName} style={{
                                marginBottom: '8px',
                                fontSize: '0.9em'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '500' }}>
                                    <span>{affName}</span>
                                    <span>{stats.batteries.toLocaleString()}</span>
                                </div>
                                <div style={{ fontSize: '0.85em', color: '#666' }}>
                                    {stats.count} Clients
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default LocationCard;
