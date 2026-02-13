'use client';
import React from 'react';
import { getAffiliateColor, getAffiliateColorDark } from '@/lib/theme';

const LocationCard = ({ location, onDropClients, onCardClick }) => {
    const validAllocations = location.allocations || [];
    const currentTotal = validAllocations.reduce((sum, a) => sum + a.amount, 0);
    const totalCapacity = location.originalCapacity || location.capacity;
    const capacityToUse = location.effectiveCapacity || location.capacity;
    const isRestricted = location.effectiveCapacity && location.effectiveCapacity < location.originalCapacity;

    // Percentages
    const usagePercentage = (currentTotal / totalCapacity) * 100;
    const targetPercentage = (capacityToUse / totalCapacity) * 100;
    const isOverTarget = currentTotal > capacityToUse;

    // Group allocations by Affiliate
    const byAffiliate = {};
    validAllocations.forEach(alloc => {
        if (!byAffiliate[alloc.affiliate]) {
            byAffiliate[alloc.affiliate] = { count: 0, batteries: 0, clients: [] };
        }
        byAffiliate[alloc.affiliate].count++;
        byAffiliate[alloc.affiliate].batteries += alloc.amount;
    });

    const affiliateList = Object.entries(byAffiliate).sort((a, b) => b[1].batteries - a[1].batteries);

    // Drag Logic
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
            className="card"
            onClick={onCardClick}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{
                padding: '20px',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                cursor: 'pointer',
                border: isDragOver ? '2px dashed var(--color-primary)' : '1px solid var(--color-border)',
                backgroundColor: isDragOver ? '#eff6ff' : 'var(--color-surface)',
                position: 'relative'
            }}
        >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '600', color: 'var(--color-text-primary)' }}>{location.name}</h3>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontFamily: 'monospace', backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                        {location.id}
                    </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: '700', color: (totalCapacity - currentTotal) < 0 ? 'var(--color-danger)' : 'var(--color-text-primary)' }}>
                        {(totalCapacity - currentTotal).toLocaleString()}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Available</div>
                </div>
            </div>

            {/* Progress Bar (Stacked) */}
            <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
                    <span>{currentTotal.toLocaleString()} / {totalCapacity.toLocaleString()} Used</span>
                    {isRestricted && <span style={{ color: 'var(--color-warning)' }}>Target: {Math.round(targetPercentage)}%</span>}
                </div>

                <div style={{
                    height: '12px',
                    backgroundColor: '#e2e8f0',
                    borderRadius: '6px',
                    overflow: 'hidden',
                    display: 'flex',
                    position: 'relative'
                }}>
                    {/* Render segments for each affiliate */}
                    {affiliateList.map(([affName, stats]) => {
                        const width = (stats.batteries / totalCapacity) * 100;
                        return (
                            <div
                                key={affName}
                                style={{
                                    width: `${width}%`,
                                    backgroundColor: getAffiliateColor(affName),
                                    height: '100%',
                                    transition: 'width 0.3s ease',
                                    borderRight: '1px solid rgba(255,255,255,0.2)' // visual separator
                                }}
                                title={`${affName}: ${stats.batteries}`}
                            />
                        );
                    })}

                    {/* Target Marker */}
                    {isRestricted && (
                        <div style={{
                            position: 'absolute',
                            left: `${Math.min(targetPercentage, 100)}%`,
                            top: 0,
                            bottom: 0,
                            width: '2px',
                            backgroundColor: 'var(--color-danger)',
                            zIndex: 10
                        }} title={`Limit: ${capacityToUse}`} />
                    )}
                </div>
            </div>

            {/* Affiliate Breakdown (Pills/List) */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {affiliateList.length === 0 ? (
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#cbd5e1',
                        fontSize: '0.875rem',
                        fontStyle: 'italic',
                        minHeight: '60px',
                        border: '1px dashed #e2e8f0',
                        borderRadius: '0.5rem'
                    }}>
                        Ready for allocation
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {affiliateList.map(([affName, stats]) => (
                            <div
                                key={affName}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    fontSize: '0.75rem',
                                    padding: '4px 8px',
                                    borderRadius: '12px',
                                    backgroundColor: getAffiliateColor(affName),
                                    color: '#1e293b', // Ensure contrast, or calc based on lightness
                                    border: '1px solid rgba(0,0,0,0.05)',
                                    fontWeight: '500'
                                }}
                                title={`${stats.count} clients`}
                            >
                                <span style={{ marginRight: '6px' }}>{affName}</span>
                                <strong>{stats.batteries}</strong>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default LocationCard;
