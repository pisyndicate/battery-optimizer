import React from 'react';

const LocationCard = ({ location, onDropClients, onCardClick }) => {
    const currentTotal = location.capacity - location.remainingCapacity;
    const percentFull = (currentTotal / location.capacity) * 100;
    const isOver = currentTotal > location.capacity;

    // Group allocations by Affiliate for display
    const byAffiliate = {};
    location.allocations.forEach(alloc => {
        if (!byAffiliate[alloc.affiliate]) {
            byAffiliate[alloc.affiliate] = { count: 0, batteries: 0, clients: [] };
        }
        byAffiliate[alloc.affiliate].count++;
        byAffiliate[alloc.affiliate].batteries += alloc.amount;
        // byAffiliate[alloc.affiliate].clients.push(alloc.clientName); 
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
                <div style={{ marginBottom: '6px', fontSize: '0.9em', fontWeight: 'bold', color: location.remainingCapacity > 0 ? '#28a745' : '#6c757d', textAlign: 'right' }}>
                    Remaining: {location.remainingCapacity.toLocaleString()}
                </div>
                <div style={{
                    height: '8px',
                    backgroundColor: '#eee',
                    borderRadius: '4px',
                    overflow: 'hidden'
                }}>
                    <div style={{
                        width: `${Math.min(percentFull, 100)}%`,
                        backgroundColor: isOver ? '#dc3545' : percentFull > 90 ? '#28a745' : '#007bff',
                        height: '100%',
                        transition: 'width 0.3s ease'
                    }} />
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
