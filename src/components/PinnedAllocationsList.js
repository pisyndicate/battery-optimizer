import React, { useState, useMemo } from 'react';

const PinnedAllocationsList = ({ pinnedAllocations, clients, locations, onRemovePin }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [expandedAffiliates, setExpandedAffiliates] = useState(new Set());
    const [expandedLocations, setExpandedLocations] = useState(new Set());

    // Grouping Logic
    const groupedData = useMemo(() => {
        const groups = {}; // { AffiliateName: { LocationId: [pin1, pin2] } }

        pinnedAllocations.forEach(pin => {
            const client = clients.find(c => c.name === pin.clientName);
            const affiliate = client ? client.affiliate : 'Unknown Affiliate';
            const locId = pin.locationId;

            if (!groups[affiliate]) groups[affiliate] = {};
            if (!groups[affiliate][locId]) groups[affiliate][locId] = [];

            groups[affiliate][locId].push(pin);
        });

        // Convert to sorted entries for rendering
        const sortedAffiliates = Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
        return sortedAffiliates.map(([affiliate, locGroups]) => {
            const sortedLocs = Object.entries(locGroups).sort((a, b) => {
                const locA = locations.find(l => l.id === a[0]) || { name: a[0] };
                const locB = locations.find(l => l.id === b[0]) || { name: b[0] };
                return locA.name.localeCompare(locB.name) || 0;
            });
            return { affiliate, locGroups: sortedLocs };
        });
    }, [pinnedAllocations, clients, locations]);

    const toggleAffiliate = (aff) => {
        const newSet = new Set(expandedAffiliates);
        if (newSet.has(aff)) newSet.delete(aff);
        else newSet.add(aff);
        setExpandedAffiliates(newSet);
    };

    const toggleLocation = (key) => {
        const newSet = new Set(expandedLocations);
        if (newSet.has(key)) newSet.delete(key);
        else newSet.add(key);
        setExpandedLocations(newSet);
    };

    if (pinnedAllocations.length === 0) return null;

    return (
        <div style={{ marginTop: '16px', border: '1px solid #dee2e6', borderRadius: '8px', overflow: 'hidden' }}>
            {/* Main Header */}
            <div
                onClick={() => setIsExpanded(!isExpanded)}
                style={{
                    padding: '12px 16px',
                    backgroundColor: '#e9ecef',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    userSelect: 'none'
                }}
            >
                <h4 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                        fontSize: '0.8em',
                        display: 'inline-block',
                        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s'
                    }}>▶</span>
                    Pinned Allocations ({pinnedAllocations.length})
                </h4>
                {isExpanded ?
                    <button style={{ fontSize: '0.85em', color: '#666', background: 'none', border: 'none', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setIsExpanded(false); }}>Collapse</button> :
                    <span style={{ fontSize: '0.85em', color: '#666' }}>Click to view details</span>
                }
            </div>

            {/* Expanded Content */}
            {isExpanded && (
                <div style={{ padding: '16px', backgroundColor: '#fff' }}>
                    {groupedData.map(({ affiliate, locGroups }) => {
                        const isAffExpanded = expandedAffiliates.has(affiliate);
                        const totalAffCount = locGroups.reduce((sum, [_, pins]) => sum + pins.length, 0);

                        return (
                            <div key={affiliate} style={{ marginBottom: '12px', border: '1px solid #eee', borderRadius: '4px', overflow: 'hidden' }}>
                                {/* Affiliate Header */}
                                <div
                                    onClick={() => toggleAffiliate(affiliate)}
                                    style={{
                                        padding: '8px 12px',
                                        backgroundColor: '#f8f9fa',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        fontWeight: 'bold',
                                        userSelect: 'none',
                                        borderBottom: isAffExpanded ? '1px solid #eee' : 'none'
                                    }}
                                >
                                    <span style={{
                                        fontSize: '0.8em',
                                        display: 'inline-block',
                                        transform: isAffExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                        transition: 'transform 0.2s'
                                    }}>▶</span>
                                    {affiliate} ({totalAffCount})
                                </div>

                                {/* Affiliate Content (Locations) */}
                                {isAffExpanded && (
                                    <div style={{ padding: '12px' }}>
                                        {locGroups.map(([locId, pins]) => {
                                            const savedLoc = locations.find(l => l.id === locId);
                                            const locName = savedLoc ? savedLoc.name : locId;
                                            const uniqueKey = `${affiliate}-${locId}`;
                                            const isLocExpanded = expandedLocations.has(uniqueKey);

                                            return (
                                                <div key={locId} style={{ marginBottom: '8px', paddingLeft: '12px' }}>
                                                    {/* Location Header */}
                                                    <div
                                                        onClick={() => toggleLocation(uniqueKey)}
                                                        style={{
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '6px',
                                                            fontWeight: '500',
                                                            color: '#495057',
                                                            marginBottom: '4px',
                                                            userSelect: 'none'
                                                        }}
                                                    >
                                                        <span style={{
                                                            fontSize: '0.7em',
                                                            display: 'inline-block',
                                                            transform: isLocExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                                            transition: 'transform 0.2s',
                                                            width: '12px'
                                                        }}>▶</span>
                                                        {locName} ({pins.length})
                                                    </div>

                                                    {/* Client List */}
                                                    {isLocExpanded && (
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', paddingLeft: '20px', marginTop: '4px' }}>
                                                            {pins.map((pin, index) => {
                                                                const client = clients.find(c => c.name === pin.clientName);
                                                                return (
                                                                    <div key={index} style={{
                                                                        padding: '4px 8px',
                                                                        backgroundColor: '#fff3cd',
                                                                        border: '1px solid #ffeeba',
                                                                        borderRadius: '4px',
                                                                        fontSize: '0.85em',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '6px'
                                                                    }}>
                                                                        <span>
                                                                            <strong>{pin.clientName}</strong>
                                                                            {client && ` (${client.batteries})`}
                                                                        </span>
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); onRemovePin(pin.clientName); }}
                                                                            style={{
                                                                                border: 'none',
                                                                                background: 'none',
                                                                                cursor: 'pointer',
                                                                                color: '#dc3545',
                                                                                fontWeight: 'bold',
                                                                                padding: '0 4px',
                                                                                fontSize: '1.2em',
                                                                                lineHeight: 1
                                                                            }}
                                                                        >
                                                                            ×
                                                                        </button>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default PinnedAllocationsList;
