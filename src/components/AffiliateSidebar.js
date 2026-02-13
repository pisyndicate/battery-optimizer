import React, { useState } from 'react';

const AffiliateSidebar = ({ affiliate, onClose }) => {
    const [collapsedGroups, setCollapsedGroups] = useState(new Set());

    const toggleGroup = (locName) => {
        const newSet = new Set(collapsedGroups);
        if (newSet.has(locName)) {
            newSet.delete(locName);
        } else {
            newSet.add(locName);
        }
        setCollapsedGroups(newSet);
    };

    if (!affiliate) return null;

    // Convert locations map to array and sort by battery count desc
    const sortedLocations = Object.values(affiliate.locations).sort((a, b) => b.batteries - a.batteries);

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            right: 0,
            width: '400px',
            height: '100vh',
            backgroundColor: '#fff',
            boxShadow: '-2px 0 8px rgba(0,0,0,0.1)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            padding: '24px',
            overflowY: 'auto'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.5rem' }}>{affiliate.name}</h2>
                    <span style={{ color: '#666' }}>{affiliate.totalBatteries.toLocaleString()} Total Units</span>
                </div>
                <button
                    onClick={onClose}
                    style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}
                >
                    ×
                </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Locations ({sortedLocations.length})</h3>
            </div>

            <div style={{ flex: 1 }}>
                {sortedLocations.map(loc => {
                    const isCollapsed = collapsedGroups.has(loc.name);

                    return (
                        <div key={loc.name} style={{ marginBottom: '16px', border: '1px solid #eee', borderRadius: '8px', overflow: 'hidden' }}>
                            {/* Location Header - Collapsible */}
                            <div
                                onClick={() => toggleGroup(loc.name)}
                                style={{
                                    padding: '12px',
                                    backgroundColor: '#e9ecef',
                                    borderBottom: isCollapsed ? 'none' : '1px solid #ddd',
                                    cursor: 'pointer',
                                    fontWeight: 'bold',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    userSelect: 'none'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    <div style={{ marginRight: '8px', fontSize: '0.8em', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                                        ▼
                                    </div>
                                    <span>{loc.name} ({loc.count})</span>
                                </div>
                                <span style={{ fontSize: '0.9em', color: '#495057' }}>{loc.batteries.toLocaleString()} units</span>
                            </div>

                            {/* Client List */}
                            {!isCollapsed && loc.clients && (
                                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                    {loc.clients.sort((a, b) => b.amount - a.amount).map(c => (
                                        <li
                                            key={c.id || c.clientName}
                                            style={{
                                                padding: '8px 12px',
                                                borderBottom: '1px solid #f8f9fa',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                fontSize: '0.9em'
                                            }}
                                        >
                                            <span>{c.clientName}</span>
                                            <span style={{ color: '#666' }}>{c.amount} units</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default AffiliateSidebar;
