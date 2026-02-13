import React, { useState } from 'react';

const LocationSidebar = ({ location, onClose }) => {
    const [selectedClients, setSelectedClients] = useState(new Set());
    const [collapsedGroups, setCollapsedGroups] = useState(new Set());

    const toggleGroup = (affiliate) => {
        const newSet = new Set(collapsedGroups);
        if (newSet.has(affiliate)) {
            newSet.delete(affiliate);
        } else {
            newSet.add(affiliate);
        }
        setCollapsedGroups(newSet);
    };

    if (!location) return null;

    // Flatten allocations into a client list
    const clients = location.allocations.map(a => ({
        id: a.clientId,
        name: a.clientName,
        batteries: a.amount,
        affiliate: a.affiliate
    })).sort((a, b) => b.batteries - a.batteries);

    const toggleSelection = (clientName) => {
        const newSet = new Set(selectedClients);
        if (newSet.has(clientName)) {
            newSet.delete(clientName);
        } else {
            newSet.add(clientName);
        }
        setSelectedClients(newSet);
    };

    const toggleSelectAll = () => {
        if (selectedClients.size === clients.length) {
            setSelectedClients(new Set());
        } else {
            setSelectedClients(new Set(clients.map(c => c.name)));
        }
    };

    const handleDragStart = (e, client) => {
        let itemsToDrag = [];
        if (selectedClients.has(client.name)) {
            itemsToDrag = Array.from(selectedClients);
        } else {
            itemsToDrag = [client.name];
        }

        e.dataTransfer.setData('application/json', JSON.stringify({ type: 'CLIENT_DRAG', clients: itemsToDrag }));
        e.dataTransfer.effectAllowed = 'copy';
    };

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
                    <h2 style={{ margin: 0, fontSize: '1.5rem' }}>{location.name}</h2>
                    <span style={{ color: '#666' }}>{location.id}</span>
                </div>
                <button
                    onClick={onClose}
                    style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}
                >
                    ×
                </button>
            </div>

            <div style={{ marginBottom: '24px', padding: '16px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span>Capacity:</span>
                    <strong>{location.capacity.toLocaleString()}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span>Used:</span>
                    <strong>{(location.capacity - location.remainingCapacity).toLocaleString()}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Remaining:</span>
                    <strong style={{ color: location.remainingCapacity >= 0 ? '#28a745' : '#dc3545' }}>
                        {location.remainingCapacity.toLocaleString()}
                    </strong>
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Clients ({clients.length})</h3>
                <button
                    onClick={toggleSelectAll}
                    style={{ color: '#007bff', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                    {selectedClients.size === clients.length ? 'Deselect All' : 'Select All'}
                </button>
            </div>

            <div style={{ flex: 1 }}>
                {Object.entries(clients.reduce((acc, client) => {
                    if (!acc[client.affiliate]) acc[client.affiliate] = [];
                    acc[client.affiliate].push(client);
                    return acc;
                }, {})).sort((a, b) => a[0].localeCompare(b[0])).map(([affiliate, groupClients]) => {
                    const totalBatteries = groupClients.reduce((sum, c) => sum + c.batteries, 0);
                    const isCollapsed = collapsedGroups.has(affiliate);

                    return (
                        <div key={affiliate} style={{ marginBottom: '16px', border: '1px solid #eee', borderRadius: '8px', overflow: 'hidden' }}>
                            {/* Affiliate Header - Draggable & Collapsible */}
                            <div
                                draggable
                                onDragStart={(e) => {
                                    const names = groupClients.map(c => c.name);
                                    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'CLIENT_DRAG', clients: names }));
                                    e.dataTransfer.effectAllowed = 'copy';
                                }}
                                onClick={() => toggleGroup(affiliate)}
                                style={{
                                    padding: '12px',
                                    backgroundColor: '#e9ecef',
                                    borderBottom: isCollapsed ? 'none' : '1px solid #ddd',
                                    cursor: 'pointer',
                                    fontWeight: 'bold',
                                    display: 'flex',
                                    alignItems: 'center',
                                    userSelect: 'none'
                                }}
                            >
                                <div style={{ marginRight: '8px', fontSize: '0.8em', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                                    ▼
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                                    <input
                                        type="checkbox"
                                        checked={groupClients.every(c => selectedClients.has(c.name))}
                                        ref={el => {
                                            if (el) {
                                                const allSelected = groupClients.every(c => selectedClients.has(c.name));
                                                const someSelected = groupClients.some(c => selectedClients.has(c.name));
                                                el.indeterminate = someSelected && !allSelected;
                                            }
                                        }}
                                        onClick={(e) => {
                                            e.stopPropagation(); // Prevent collapse
                                            const allSelected = groupClients.every(c => selectedClients.has(c.name));
                                            const newSet = new Set(selectedClients);

                                            if (allSelected) {
                                                groupClients.forEach(c => newSet.delete(c.name));
                                            } else {
                                                groupClients.forEach(c => newSet.add(c.name));
                                            }
                                            setSelectedClients(newSet);
                                        }}
                                        style={{ marginRight: '10px', cursor: 'pointer' }}
                                    />
                                    <span>{affiliate} ({groupClients.length})</span>
                                </div>
                                <span style={{ fontSize: '0.9em', color: '#495057' }}>{totalBatteries.toLocaleString()} units</span>
                            </div>

                            {/* Client List */}
                            {!isCollapsed && (
                                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                    {groupClients.map(c => (
                                        <li
                                            key={c.id || c.name}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, c)}
                                            style={{
                                                padding: '8px 12px',
                                                borderBottom: '1px solid #f8f9fa',
                                                backgroundColor: selectedClients.has(c.name) ? '#f0f8ff' : '#fff',
                                                cursor: 'grab',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '12px'
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedClients.has(c.name)}
                                                onChange={() => toggleSelection(c.name)}
                                            />
                                            <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', fontSize: '0.9em' }}>
                                                <span>{c.name}</span>
                                                <span style={{ color: '#666' }}>{c.batteries}</span>
                                            </div>
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

export default LocationSidebar;
