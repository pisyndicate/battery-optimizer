import React, { useState } from 'react';

const ValidationStats = ({ locations, totalClients, unallocatedList = [] }) => {
    const [selectedClients, setSelectedClients] = useState(new Set());

    // Flatten all allocations with location info
    const allAllocations = locations.flatMap(l => l.allocations.map(a => ({ ...a, locationName: l.name })));

    // Count occurrences of each Client ID and track locations
    const clientMap = {};
    allAllocations.forEach(a => {
        if (!clientMap[a.clientId]) {
            clientMap[a.clientId] = {
                id: a.clientId,
                name: a.clientName,
                count: 0,
                locations: []
            };
        }
        clientMap[a.clientId].count += 1;
        clientMap[a.clientId].locations.push(a.locationName);
    });

    const allocatedClientCount = totalClients - unallocatedList.length;

    // Only count as "split" if they are in more than 1 UNIQUE location
    const splitClientList = Object.values(clientMap).filter(c => {
        const uniqueLocs = new Set(c.locations);
        return uniqueLocs.size > 1;
    });

    const splitClients = splitClientList.length;
    const unallocatedCount = unallocatedList.length;

    const isHealthy = splitClients === 0 && unallocatedCount === 0;

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
        if (selectedClients.size === unallocatedList.length) {
            setSelectedClients(new Set());
        } else {
            setSelectedClients(new Set(unallocatedList.map(c => c.name)));
        }
    };

    const handleDragStart = (e, client) => {
        // ... (unchanged)
        let itemsToDrag = [];
        if (selectedClients.has(client.name)) {
            itemsToDrag = Array.from(selectedClients);
        } else {
            itemsToDrag = [client.name];
        }

        e.dataTransfer.setData('application/json', JSON.stringify({ type: 'CLIENT_DRAG', clients: itemsToDrag }));
        e.dataTransfer.effectAllowed = 'copy';
    };

    // ── Search & Sort Logic ────────────────────────────
    const [searchTerm, setSearchTerm] = useState("");
    const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });

    const displayedClients = React.useMemo(() => {
        let result = [...unallocatedList];

        // 1. Filter
        if (searchTerm.trim()) {
            const lowerTerm = searchTerm.toLowerCase();
            result = result.filter(c =>
                c.name.toLowerCase().includes(lowerTerm) ||
                (c.affiliate && c.affiliate.toLowerCase().includes(lowerTerm))
            );
        }

        // 2. Sort
        result.sort((a, b) => {
            let valA = a[sortConfig.key];
            let valB = b[sortConfig.key];

            // Normalize strings
            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return result;
    }, [unallocatedList, searchTerm, sortConfig]);

    return (
        <div style={{
            padding: '12px 16px',
            backgroundColor: isHealthy ? '#d4edda' : '#fff3cd',
            color: isHealthy ? '#155724' : '#856404',
            border: `1px solid ${isHealthy ? '#c3e6cb' : '#ffeeba'}`,
            borderRadius: '8px',
            marginBottom: '24px',
            fontSize: '0.9em'
        }}>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '1em', fontWeight: 'bold' }}>
                System Validation: {isHealthy ? 'PASSED' : 'WARNING'}
            </h2>
            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                <div>
                    <strong>Allocated Clients:</strong> {allocatedClientCount} / {totalClients}
                </div>
                <div style={{ fontWeight: splitClients > 0 ? 'bold' : 'normal', color: splitClients > 0 ? '#721c24' : 'inherit' }}>
                    <strong>Split Clients:</strong> {splitClients}
                    {splitClients > 0 && <span style={{ marginLeft: '8px', fontSize: '0.8em' }}>(Error: Clients appearing in multiple locations)</span>}
                </div>
                <div style={{ fontWeight: unallocatedCount > 0 ? 'bold' : 'normal', color: unallocatedCount > 0 ? '#bd2130' : 'inherit' }}>
                    <strong>Unallocated:</strong> {unallocatedCount} Clients ({unallocatedList.reduce((sum, c) => sum + c.batteries, 0).toLocaleString()} Batteries)
                </div>
            </div>

            {/* Split Clients List */}
            {splitClients > 0 && (
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(0,0,0,0.1)' }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '0.95em', color: '#721c24' }}>Split Client Details:</h4>
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', maxHeight: '150px', overflowY: 'auto' }}>
                        {splitClientList.map(client => (
                            <li key={client.id} style={{ padding: '4px 0', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                                <strong>{client.name}</strong> is in: {client.locations.join(', ')}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {unallocatedCount > 0 && (
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(0,0,0,0.1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <h4 style={{ margin: 0, fontSize: '0.95em' }}>Unallocated Clients (Drag to Location to Force Placement):</h4>
                        <button
                            onClick={toggleSelectAll}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: '#007bff',
                                cursor: 'pointer',
                                fontSize: '0.85em',
                                textDecoration: 'underline'
                            }}
                        >
                            {selectedClients.size === unallocatedList.length ? 'Deselect All' : 'Select All'}
                        </button>
                    </div>

                    {/* ── Search & Sort Controls ── */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                        <input
                            type="text"
                            placeholder="Search clients..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                flex: 1,
                                padding: '4px 8px',
                                borderRadius: '4px',
                                border: '1px solid #ccc',
                                fontSize: '0.85em'
                            }}
                        />
                        <select
                            value={`${sortConfig.key}-${sortConfig.direction}`}
                            onChange={(e) => {
                                const [key, direction] = e.target.value.split('-');
                                setSortConfig({ key, direction });
                            }}
                            style={{
                                padding: '4px 8px',
                                borderRadius: '4px',
                                border: '1px solid #ccc',
                                fontSize: '0.85em',
                                backgroundColor: '#fff'
                            }}
                        >
                            <option value="name-asc">Name (A-Z)</option>
                            <option value="name-desc">Name (Z-A)</option>
                            <option value="batteries-desc">Size (High-Low)</option>
                            <option value="batteries-asc">Size (Low-High)</option>
                        </select>
                    </div>

                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', maxHeight: '200px', overflowY: 'auto' }}>
                        {displayedClients.map(c => (
                            <li
                                key={c.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, c)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '4px 8px',
                                    backgroundColor: selectedClients.has(c.name) ? 'rgba(0, 123, 255, 0.1)' : 'transparent',
                                    cursor: 'grab',
                                    borderBottom: '1px solid #eee'
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedClients.has(c.name)}
                                    onChange={() => toggleSelection(c.name)}
                                    style={{ marginRight: '8px' }}
                                />
                                <span style={{ flex: 1 }}>
                                    <strong>{c.name}</strong> ({c.affiliate}) - {c.batteries} units
                                </span>
                            </li>
                        ))}
                        {displayedClients.length === 0 && (
                            <li style={{ padding: '8px', color: '#666', fontStyle: 'italic', textAlign: 'center' }}>
                                No clients match your search.
                            </li>
                        )}
                    </ul>
                </div>
            )}

            <div style={{ marginTop: '8px', fontSize: '0.85em', opacity: 0.8 }}>
                * Verification ensures that each client entry is assigned to exactly one location and not split.
            </div>
        </div>
    );
};

export default ValidationStats;
