'use client';
import React, { useState, useMemo } from 'react';
import { INITIAL_LOCATIONS, INITIAL_CLIENTS } from '@/lib/data';
import { allocateBatteries, adjustClientCounts } from '@/lib/optimizer';
import LocationCard from '@/components/LocationCard';
import ValidationStats from '@/components/ValidationStats';
import LocationSidebar from '@/components/LocationSidebar';
import PinnedAllocationsList from '@/components/PinnedAllocationsList';

import DataManagement from '@/components/DataManagement';

export default function Home() {
    const [selectedLocation, setSelectedLocation] = useState(null);
    const [useAdjustedCounts, setUseAdjustedCounts] = useState(false);
    const [exclusiveAffiliates, setExclusiveAffiliates] = useState([]); // Array of strings e.g. ["Brown and Sterling"]
    const [pinnedAllocations, setPinnedAllocations] = useState([]); // Array of { clientName, locationId }
    const [pinAffiliateFilter, setPinAffiliateFilter] = useState(""); // For UI dropdown filtering
    const [selectedPinClients, setSelectedPinClients] = useState(new Set()); // For manual multi-select pinning
    const [overflowState, setOverflowState] = useState(null); // { primaryLocId, clientNames }
    const [overflowLocId, setOverflowLocId] = useState("");
    const [customData, setCustomData] = useState(null);
    const [runId, setRunId] = useState(0);

    const toggleExclusive = (name) => {
        setExclusiveAffiliates(prev =>
            prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
        );
    };

    const addPin = (clientName, locationId) => {
        setPinnedAllocations(prev => {
            // Remove existing pin for this client if exists
            const filtered = prev.filter(p => p.clientName !== clientName);
            return [...filtered, { clientName, locationId }];
        });
    };

    const removePin = (clientName) => {
        setPinnedAllocations(prev => prev.filter(p => p.clientName !== clientName));
    };

    const locations = useMemo(() => customData?.locations || INITIAL_LOCATIONS, [customData]);

    const clients = useMemo(() => {
        let baseClients = customData?.clients || INITIAL_CLIENTS;
        if (useAdjustedCounts) {
            return adjustClientCounts(baseClients, 18681);
        }
        return baseClients;
    }, [useAdjustedCounts, customData]);

    // Run Allocation
    const { locations: allocatedLocations, clients: processedClients } = useMemo(() => {
        return allocateBatteries(clients, locations, exclusiveAffiliates, pinnedAllocations);
    }, [clients, locations, exclusiveAffiliates, pinnedAllocations, runId]);

    const unallocatedClients = processedClients ? processedClients.filter(c => !c.allocated) : [];

    const totalCapacity = locations.reduce((sum, l) => sum + l.capacity, 0);
    const totalDemand = clients.reduce((sum, c) => sum + c.batteries, 0);

    const handleExportCSV = () => {
        const headers = ['Location Name', 'Location Capacity', 'Client Name', 'Affiliate', 'Batteries'];
        const rows = [headers.join(',')];

        allocatedLocations.forEach(loc => {
            loc.allocations.forEach(alloc => {
                const safeLoc = `"${loc.name.replace(/"/g, '""')}"`;
                const safeClient = `"${alloc.clientName.replace(/"/g, '""')}"`;
                const safeAffiliate = `"${alloc.affiliate.replace(/"/g, '""')}"`;
                rows.push(`${safeLoc},${loc.capacity},${safeClient},${safeAffiliate},${alloc.amount}`);
            });
        });

        const csvContent = rows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'battery_manifest.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <main style={{
            padding: '24px',
            paddingRight: selectedLocation ? '440px' : '24px', // Shift content for sidebar (400px + padding)
            maxWidth: selectedLocation ? '100%' : '1600px', // Allow full width when sidebar is open
            margin: '0 auto',
            transition: 'all 0.3s ease'
        }}>
            <header style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ fontSize: '2rem', fontWeight: 'bold' }}>Battery Allocation Optimizer</h1>
                    <p style={{ color: '#666' }}>Client Level Allocation</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ marginBottom: '8px' }}>
                        <button onClick={handleExportCSV} style={{ marginRight: '16px', color: '#007bff', background: 'none', border: 'none', padding: 0, fontSize: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}>Export CSV</button>
                        <a href="/print" target="_blank" style={{ marginRight: '16px', color: '#007bff' }}>Print Manifest</a>
                        <strong>Total Capacity:</strong> {totalCapacity.toLocaleString()}
                    </div>
                    <div>
                        <strong>Total Demand:</strong> {totalDemand.toLocaleString()}
                        <span style={{
                            color: totalDemand !== totalCapacity ? '#dc3545' : '#28a745',
                            marginLeft: '8px',
                            fontWeight: 'bold'
                        }}>
                            ({(totalDemand - totalCapacity).toLocaleString()})
                        </span>
                    </div>
                </div>
            </header>

            <DataManagement
                onDataUpload={(data) => setCustomData(prev => ({ ...prev, ...data }))}
                onReset={() => {
                    if (confirm('Reset to default data?')) setCustomData(null);
                }}
            />

            <ValidationStats
                locations={allocatedLocations}
                totalClients={clients.length}
                unallocatedList={unallocatedClients}
            />

            <div style={{ marginBottom: '24px', padding: '16px', backgroundColor: '#e9ecef', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Controls</h2>
                    <button
                        onClick={() => setRunId(prev => prev + 1)}
                        style={{ padding: '6px 12px', fontSize: '0.9em', backgroundColor: '#fff', border: '1px solid #ced4da', borderRadius: '4px', cursor: 'pointer' }}
                        title="Re-run optimization logic"
                    >
                        🔄 Refresh Organization
                    </button>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={useAdjustedCounts}
                        onChange={(e) => setUseAdjustedCounts(e.target.checked)}
                    />
                    Scale Client Counts to Fill Capacity (Target: 18,681)
                </label>

                <div style={{ marginTop: '16px', borderTop: '1px solid #ccc', paddingTop: '16px' }}>
                    <h3 style={{ fontSize: '1rem', marginBottom: '8px' }}>Segregate Affiliates (Exclusive Location Mode)</h3>
                    <p style={{ fontSize: '0.85em', color: '#666', marginBottom: '8px' }}>
                        Selected affiliates will be granted exclusive access to locations. No other affiliates will share their space.
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                        {Array.from(new Set(clients.map(c => c.affiliate))).sort().map(aff => (
                            <label key={aff} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '4px 8px',
                                backgroundColor: exclusiveAffiliates.includes(aff) ? '#cce5ff' : '#fff',
                                borderRadius: '4px',
                                border: '1px solid #ddd',
                                fontSize: '0.9em',
                                cursor: 'pointer'
                            }}>
                                <input
                                    type="checkbox"
                                    checked={exclusiveAffiliates.includes(aff)}
                                    onChange={() => toggleExclusive(aff)}
                                />
                                {aff}
                            </label>
                        ))}
                    </div>
                </div>
            </div>

            {/* Pin Clients Section */}
            <div style={{ marginBottom: '24px', padding: '16px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #dee2e6' }}>
                <h2 style={{ fontSize: '1.2rem', marginBottom: '12px' }}>Pin Clients to Locations</h2>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>

                    {/* Select Affiliate Filter */}
                    {/* Select Affiliate Filter */}
                    <div style={{ flex: 1, minWidth: '200px' }}>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.9em' }}>Affiliate Filter</label>
                        <select
                            style={{ width: '100%', padding: '4px 8px', borderRadius: '4px', border: '1px solid #ccc' }}
                            onChange={(e) => {
                                setPinAffiliateFilter(e.target.value);
                                setSelectedPinClients(new Set()); // Clear selection on filter change
                            }}
                            value={pinAffiliateFilter}
                        >
                            <option value="">All Affiliates</option>
                            {Array.from(new Set(clients.map(c => c.affiliate))).sort().map(aff => (
                                <option key={aff} value={aff}>{aff}</option>
                            ))}
                        </select>
                    </div>

                    {/* Select Clients (Multi) */}
                    <div style={{ flex: 2, minWidth: '300px' }}>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.9em' }}>
                            Select Clients ({selectedPinClients.size})
                            {pinAffiliateFilter && (
                                <span
                                    style={{ marginLeft: '8px', cursor: 'pointer', color: '#007bff', fontSize: '0.9em' }}
                                    onClick={() => {
                                        const visibleClients = clients.filter(c => !pinAffiliateFilter || c.affiliate === pinAffiliateFilter);
                                        if (selectedPinClients.size === visibleClients.length) {
                                            setSelectedPinClients(new Set());
                                        } else {
                                            setSelectedPinClients(new Set(visibleClients.map(c => c.name)));
                                        }
                                    }}
                                >
                                    (Toggle All)
                                </span>
                            )}
                        </label>
                        <div style={{
                            height: '150px',
                            overflowY: 'auto',
                            border: '1px solid #ccc',
                            borderRadius: '4px',
                            padding: '8px',
                            backgroundColor: '#fff'
                        }}>
                            {clients
                                .filter(c => !pinAffiliateFilter || c.affiliate === pinAffiliateFilter)
                                .sort((a, b) => a.name.localeCompare(b.name))
                                .map(c => (
                                    <label key={c.id || c.name} style={{ display: 'flex', alignItems: 'center', marginBottom: '4px', fontSize: '0.9em', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={selectedPinClients.has(c.name)}
                                            onChange={() => {
                                                const newSet = new Set(selectedPinClients);
                                                if (newSet.has(c.name)) newSet.delete(c.name);
                                                else newSet.add(c.name);
                                                setSelectedPinClients(newSet);
                                            }}
                                            style={{ marginRight: '6px' }}
                                        />
                                        {c.name} ({c.batteries})
                                    </label>
                                ))}
                        </div>
                    </div>

                    {/* Select Location & Action */}
                    <div style={{ flex: 1, minWidth: '200px' }}>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.9em' }}>Target Location</label>
                        <select
                            id="pin-location-select"
                            style={{ width: '100%', padding: '4px 8px', borderRadius: '4px', border: '1px solid #ccc', marginBottom: '8px' }}
                        >
                            <option value="">-- Choose Location --</option>
                            {locations
                                .sort((a, b) => b.capacity - a.capacity)
                                .map(l => (
                                    <option key={l.id} value={l.id}>
                                        {l.name} (Cap: {l.capacity})
                                    </option>
                                ))}
                        </select>
                        <button
                            onClick={() => {
                                const locSelect = document.getElementById('pin-location-select');
                                const locId = locSelect.value;
                                if (selectedPinClients.size > 0 && locId) {
                                    const clientNames = Array.from(selectedPinClients);

                                    // Validation
                                    const targetLoc = locations.find(l => l.id === locId);
                                    const startPins = pinnedAllocations.filter(p => p.locationId === locId && !clientNames.includes(p.clientName));
                                    const currentLoad = startPins.reduce((sum, p) => {
                                        const c = clients.find(cl => cl.name === p.clientName);
                                        return sum + (c ? c.batteries : 0);
                                    }, 0);
                                    const newLoad = clientNames.reduce((sum, name) => {
                                        const c = clients.find(cl => cl.name === name);
                                        return sum + (c ? c.batteries : 0);
                                    }, 0);

                                    if (currentLoad + newLoad > targetLoc.capacity) {
                                        // Trigger Overflow Mode
                                        setOverflowState({ primaryLocId: locId, clientNames });
                                        return;
                                    }

                                    setPinnedAllocations(prev => {
                                        const filtered = prev.filter(p => !clientNames.includes(p.clientName));
                                        const newPins = clientNames.map(name => ({ clientName: name, locationId: locId }));
                                        return [...filtered, ...newPins];
                                    });
                                    setSelectedPinClients(new Set()); // Reset selection
                                }
                            }}
                            disabled={selectedPinClients.size === 0 || !!overflowState}
                            style={{
                                width: '100%',
                                padding: '8px 12px',
                                backgroundColor: selectedPinClients.size > 0 && !overflowState ? '#28a745' : '#6c757d',
                                color: 'white',
                                borderRadius: '4px',
                                border: 'none',
                                cursor: selectedPinClients.size > 0 && !overflowState ? 'pointer' : 'not-allowed'
                            }}
                        >
                            Pin {selectedPinClients.size} Clients
                        </button>
                    </div>
                </div>

                {/* Overflow UI */}
                {overflowState && (() => {
                    const primaryLoc = locations.find(l => l.id === overflowState.primaryLocId);
                    const clientObjects = overflowState.clientNames.map(name => clients.find(c => c.name === name)).filter(Boolean);
                    const totalDemand = clientObjects.reduce((s, c) => s + c.batteries, 0);

                    // Calculate existing load to determine remaining space in primary
                    const existingPins = pinnedAllocations.filter(p => p.locationId === overflowState.primaryLocId && !overflowState.clientNames.includes(p.clientName));
                    const existingLoad = existingPins.reduce((sum, p) => {
                        const c = clients.find(cl => cl.name === p.clientName);
                        return sum + (c ? c.batteries : 0);
                    }, 0);
                    const spaceInPrimary = Math.max(0, primaryLoc.capacity - existingLoad);

                    return (
                        <div style={{ marginTop: '16px', padding: '12px', border: '1px solid #dc3545', borderRadius: '4px', backgroundColor: '#fff5f5' }}>
                            <h4 style={{ color: '#dc3545', marginTop: 0 }}>⚠️ Capacity Exceeded for {primaryLoc?.name}</h4>
                            <p style={{ fontSize: '0.9em' }}>
                                Selected clients ({totalDemand} units) exceed available space ({spaceInPrimary} units).
                                <br />
                                Please select an Overflow Location.
                            </p>

                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '12px' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.9em' }}>Overflow Location</label>
                                    <select
                                        style={{ width: '100%', padding: '4px 8px', borderRadius: '4px', border: '1px solid #ccc' }}
                                        value={overflowLocId}
                                        onChange={(e) => setOverflowLocId(e.target.value)}
                                    >
                                        <option value="">-- Choose Overflow --</option>
                                        {locations
                                            .filter(l => l.id !== overflowState.primaryLocId)
                                            .sort((a, b) => b.capacity - a.capacity)
                                            .map(l => (
                                                <option key={l.id} value={l.id}>
                                                    {l.name} (Cap: {l.capacity})
                                                </option>
                                            ))}
                                    </select>
                                </div>
                                <button
                                    onClick={() => {
                                        if (!overflowLocId) return;

                                        // GREEDY SPLIT LOGIC
                                        // Sort clients descending
                                        const sortedClients = [...clientObjects].sort((a, b) => b.batteries - a.batteries);

                                        let currentPrimaryLoad = existingLoad;
                                        const primaryPins = [];
                                        const overflowPins = [];

                                        sortedClients.forEach(c => {
                                            if (currentPrimaryLoad + c.batteries <= primaryLoc.capacity) {
                                                primaryPins.push({ clientName: c.name, locationId: overflowState.primaryLocId });
                                                currentPrimaryLoad += c.batteries;
                                            } else {
                                                overflowPins.push({ clientName: c.name, locationId: overflowLocId });
                                            }
                                        });

                                        // Validate Overflow Capacity
                                        const overflowLoc = locations.find(l => l.id === overflowLocId);
                                        const existingOverflowPins = pinnedAllocations.filter(p => p.locationId === overflowLocId && !overflowState.clientNames.includes(p.clientName));
                                        const existingOverflowLoad = existingOverflowPins.reduce((sum, p) => {
                                            const c = clients.find(cl => cl.name === p.clientName);
                                            return sum + (c ? c.batteries : 0);
                                        }, 0);

                                        const newOverflowLoad = overflowPins.reduce((s, p) => {
                                            const c = clients.find(cl => cl.name === p.clientName);
                                            return s + (c ? c.batteries : 0);
                                        }, 0);

                                        if (existingOverflowLoad + newOverflowLoad > overflowLoc.capacity) {
                                            if (!confirm(`Combined Overflow exceeds ${overflowLoc.name}'s capacity! Proceed anyway?`)) {
                                                return;
                                            }
                                        }

                                        // Apply Split
                                        setPinnedAllocations(prev => {
                                            const filtered = prev.filter(p => !overflowState.clientNames.includes(p.clientName));
                                            return [...filtered, ...primaryPins, ...overflowPins];
                                        });

                                        // Cleanup
                                        setSelectedPinClients(new Set());
                                        setOverflowState(null);
                                        setOverflowLocId("");
                                    }}
                                    style={{
                                        padding: '6px 12px',
                                        backgroundColor: '#17a2b8',
                                        color: 'white',
                                        borderRadius: '4px',
                                        border: 'none',
                                        cursor: 'pointer',
                                        marginTop: '18px'
                                    }}
                                >
                                    Confirm Split
                                </button>
                                <button
                                    onClick={() => {
                                        // Force into Primary Logic
                                        setPinnedAllocations(prev => {
                                            const filtered = prev.filter(p => !overflowState.clientNames.includes(p.clientName));
                                            const newPins = overflowState.clientNames.map(name => ({
                                                clientName: name,
                                                locationId: overflowState.primaryLocId
                                            }));
                                            return [...filtered, ...newPins];
                                        });

                                        setSelectedPinClients(new Set());
                                        setOverflowState(null);
                                        setOverflowLocId("");
                                    }}
                                    style={{
                                        padding: '6px 12px',
                                        backgroundColor: '#dc3545',
                                        color: 'white',
                                        borderRadius: '4px',
                                        border: 'none',
                                        cursor: 'pointer',
                                        marginTop: '18px'
                                    }}
                                >
                                    Force into {primaryLoc.name}
                                </button>
                                <button
                                    onClick={() => {
                                        setOverflowState(null);
                                        setOverflowLocId("");
                                    }}
                                    style={{
                                        padding: '6px 12px',
                                        backgroundColor: '#6c757d',
                                        color: 'white',
                                        borderRadius: '4px',
                                        border: 'none',
                                        cursor: 'pointer',
                                        marginTop: '18px'
                                    }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    );
                })()}

                {/* List of Pinned Items */}
                <PinnedAllocationsList
                    pinnedAllocations={pinnedAllocations}
                    clients={clients}
                    locations={locations}
                    onRemovePin={removePin}
                />
            </div>

            <section>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '16px' }}>Allocations</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                    {allocatedLocations.map(loc => (
                        <LocationCard
                            key={loc.id}
                            location={loc}
                            onDropClients={(locId, clientNames) => {
                                // Validation
                                const targetLoc = locations.find(l => l.id === locId);
                                const startPins = pinnedAllocations.filter(p => p.locationId === locId && !clientNames.includes(p.clientName));
                                const currentLoad = startPins.reduce((sum, p) => {
                                    const c = clients.find(cl => cl.name === p.clientName);
                                    return sum + (c ? c.batteries : 0);
                                }, 0);
                                const newLoad = clientNames.reduce((sum, name) => {
                                    const c = clients.find(cl => cl.name === name);
                                    return sum + (c ? c.batteries : 0);
                                }, 0);

                                if (currentLoad + newLoad > targetLoc.capacity) {
                                    if (!confirm(`Capacity Warning: Adding these clients will exceed ${targetLoc.name}'s capacity. Proceed anyway?`)) {
                                        return;
                                    }
                                }

                                // Batch add pins directly
                                setPinnedAllocations(prev => {
                                    const filtered = prev.filter(p => !clientNames.includes(p.clientName));
                                    const newPins = clientNames.map(name => ({ clientName: name, locationId: locId }));
                                    return [...filtered, ...newPins];
                                });
                            }}
                            onCardClick={() => setSelectedLocation(loc)}
                        />
                    ))}
                </div>
            </section>

            {selectedLocation && (
                <LocationSidebar
                    location={selectedLocation}
                    onClose={() => setSelectedLocation(null)}
                />
            )}
        </main>
    );
}
