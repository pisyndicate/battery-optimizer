import React, { useState, useMemo } from 'react';

const ClientListView = ({ clients, globalSearch, locations, onMoveClients }) => {
    const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });
    const [selectedClients, setSelectedClients] = useState(new Set());
    const [targetLocationId, setTargetLocationId] = useState("");

    // Helper to get location name for a client
    const getLocationName = (clientName) => {
        for (const loc of locations) {
            if (loc.allocations.some(a => a.clientName === clientName)) {
                return loc.name;
            }
        }
        return 'Unallocated';
    };

    // Filter and Sort
    const displayedClients = useMemo(() => {
        let result = clients.map(c => ({
            ...c,
            locationName: getLocationName(c.name)
        }));

        // 1. Global Filter
        if (globalSearch.trim()) {
            const lowerTerm = globalSearch.toLowerCase();
            result = result.filter(c =>
                c.name.toLowerCase().includes(lowerTerm) ||
                c.affiliate.toLowerCase().includes(lowerTerm) ||
                c.locationName.toLowerCase().includes(lowerTerm)
            );
        }

        // 2. Sort
        result.sort((a, b) => {
            let valA = a[sortConfig.key];
            let valB = b[sortConfig.key];

            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return result;
    }, [clients, globalSearch, locations, sortConfig]);

    const handleSort = (key) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const getSortIcon = (key) => {
        if (sortConfig.key !== key) return '↕';
        return sortConfig.direction === 'asc' ? '↑' : '↓';
    };

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
        if (selectedClients.size === displayedClients.length) {
            setSelectedClients(new Set());
        } else {
            setSelectedClients(new Set(displayedClients.map(c => c.name)));
        }
    };

    const totalSelectedBatteries = useMemo(() => {
        return clients
            .filter(c => selectedClients.has(c.name))
            .reduce((sum, c) => sum + c.batteries, 0);
    }, [clients, selectedClients]);

    const handleMove = () => {
        if (selectedClients.size === 0 || !targetLocationId) return;
        onMoveClients(Array.from(selectedClients), targetLocationId);
        setSelectedClients(new Set()); // Clear selection after move
        setTargetLocationId("");
    };

    return (
        <div style={{ paddingBottom: '40px' }}>
            {/* Bulk Actions Toolbar */}
            <div style={{
                marginBottom: '16px',
                padding: '12px',
                backgroundColor: 'var(--color-surface)',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                justifyContent: 'space-between'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>
                        {selectedClients.size} selected
                        {selectedClients.size > 0 && (
                            <span style={{ color: 'var(--color-primary)', marginLeft: '4px' }}>
                                ({totalSelectedBatteries.toLocaleString()} batteries)
                            </span>
                        )}
                    </span>
                    <button
                        onClick={toggleSelectAll}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--color-primary)',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            textDecoration: 'underline'
                        }}
                    >
                        {selectedClients.size === displayedClients.length && displayedClients.length > 0 ? 'Deselect All' : 'Select All'}
                    </button>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <select
                        value={targetLocationId}
                        onChange={(e) => setTargetLocationId(e.target.value)}
                        style={{
                            padding: '8px',
                            borderRadius: '6px',
                            border: '1px solid var(--color-border)',
                            fontSize: '0.85rem',
                            minWidth: '200px'
                        }}
                        disabled={selectedClients.size === 0}
                    >
                        <option value="">Move to Location...</option>
                        {locations.map(loc => (
                            <option key={loc.id} value={loc.id}>{loc.name} (Cap: {loc.capacity})</option>
                        ))}
                    </select>
                    <button
                        onClick={handleMove}
                        disabled={selectedClients.size === 0 || !targetLocationId}
                        style={{
                            padding: '8px 16px',
                            backgroundColor: selectedClients.size > 0 && targetLocationId ? 'var(--color-primary)' : '#e2e8f0',
                            color: selectedClients.size > 0 && targetLocationId ? 'white' : '#94a3b8',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: selectedClients.size > 0 && targetLocationId ? 'pointer' : 'not-allowed',
                            fontWeight: '600',
                            fontSize: '0.85rem'
                        }}
                    >
                        Move Clients
                    </button>
                </div>
            </div>

            <div style={{
                backgroundColor: 'var(--color-surface)',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                overflow: 'hidden'
            }}>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '40px 2fr 1fr 1fr 1.5fr',
                    padding: '12px 16px',
                    backgroundColor: '#f8fafc',
                    borderBottom: '1px solid var(--color-border)',
                    fontWeight: '600',
                    fontSize: '0.875rem',
                    color: '#64748b'
                }}>
                    <div>
                        <input
                            type="checkbox"
                            checked={displayedClients.length > 0 && selectedClients.size === displayedClients.length}
                            onChange={toggleSelectAll}
                        />
                    </div>
                    <div onClick={() => handleSort('name')} style={{ cursor: 'pointer' }}>
                        Client Name {getSortIcon('name')}
                    </div>
                    <div onClick={() => handleSort('batteries')} style={{ cursor: 'pointer' }}>
                        Batteries {getSortIcon('batteries')}
                    </div>
                    <div onClick={() => handleSort('affiliate')} style={{ cursor: 'pointer' }}>
                        Affiliate {getSortIcon('affiliate')}
                    </div>
                    <div onClick={() => handleSort('locationName')} style={{ cursor: 'pointer' }}>
                        Location {getSortIcon('locationName')}
                    </div>
                </div>

                <div style={{ maxHeight: 'calc(100vh - 320px)', overflowY: 'auto' }}>
                    {displayedClients.length === 0 ? (
                        <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
                            No clients found matching "{globalSearch}"
                        </div>
                    ) : (
                        displayedClients.map(c => (
                            <div key={c.id} style={{
                                display: 'grid',
                                gridTemplateColumns: '40px 2fr 1fr 1fr 1.5fr',
                                padding: '12px 16px',
                                borderBottom: '1px solid var(--color-border)',
                                fontSize: '0.875rem',
                                color: 'var(--color-text-primary)',
                                alignItems: 'center',
                                backgroundColor: selectedClients.has(c.name) ? '#eff6ff' : 'transparent'
                            }}>
                                <div>
                                    <input
                                        type="checkbox"
                                        checked={selectedClients.has(c.name)}
                                        onChange={() => toggleSelection(c.name)}
                                    />
                                </div>
                                <div style={{ fontWeight: '500' }}>{c.name}</div>
                                <div>{c.batteries.toLocaleString()}</div>
                                <div style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '2px 8px',
                                    borderRadius: '12px',
                                    backgroundColor: '#f1f5f9',
                                    fontSize: '0.75rem',
                                    width: 'fit-content'
                                }}>
                                    {c.affiliate}
                                </div>
                                <div style={{
                                    color: c.locationName === 'Unallocated' ? '#ef4444' : '#10b981',
                                    fontWeight: '500'
                                }}>
                                    {c.locationName}
                                </div>
                            </div>
                        ))
                    )}
                </div>
                <div style={{
                    padding: '12px 16px',
                    backgroundColor: '#f8fafc',
                    borderTop: '1px solid var(--color-border)',
                    fontSize: '0.8rem',
                    color: '#64748b',
                    textAlign: 'right'
                }}>
                    Showing {displayedClients.length} clients
                </div>
            </div>
        </div>
    );
};

export default ClientListView;
