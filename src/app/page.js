'use client';
import React, { useState, useMemo, useEffect } from 'react';
import { INITIAL_LOCATIONS, INITIAL_CLIENTS } from '@/lib/data';
import { allocateBatteries, adjustClientCounts } from '@/lib/optimizer';
import LocationCard from '@/components/LocationCard';
import ValidationStats from '@/components/ValidationStats';
import LocationSidebar from '@/components/LocationSidebar';
import AffiliateSidebar from '@/components/AffiliateSidebar';
import AffiliateAllocations from '@/components/AffiliateAllocations';
import AffiliateSummary from '@/components/AffiliateSummary';
import DashboardLayout from '@/components/layout/DashboardLayout';
import SidebarControls from '@/components/controls/SidebarControls';
import { theme } from '@/lib/theme';
import { useToast } from '@/contexts/ToastContext';
import OverflowModal from '@/components/OverflowModal';
import ClientListView from '@/components/ClientListView';

export default function Home() {
    const { showToast } = useToast();
    const [selectedLocation, setSelectedLocation] = useState(null);
    const [selectedAffiliate, setSelectedAffiliate] = useState(null);
    const [viewMode, setViewMode] = useState('locations'); // 'locations' | 'affiliates'
    const [useAdjustedCounts, setUseAdjustedCounts] = useState(false);
    const [exclusiveAffiliates, setExclusiveAffiliates] = useState([]);
    const [pinnedAllocations, setPinnedAllocations] = useState([]);
    const [overflowState, setOverflowState] = useState(null);
    const [globalSearch, setGlobalSearch] = useState(""); // New Global Search State

    const [customData, setCustomData] = useState(null);
    const [runId, setRunId] = useState(0);
    const [targetUtilization, setTargetUtilization] = useState(100);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [distributionStrategy, setDistributionStrategy] = useState('default');

    // Ref for auto-save state to avoid interval reset and hook errors
    const stateRef = React.useRef({ customData, pinnedAllocations, exclusiveAffiliates, targetUtilization, useAdjustedCounts, distributionStrategy });
    stateRef.current = { customData, pinnedAllocations, exclusiveAffiliates, targetUtilization, useAdjustedCounts, distributionStrategy };

    // Auto-save mechanism (every 5 minutes)
    useEffect(() => {
        const interval = setInterval(() => {
            try {
                const { saveAutoSave } = require('@/components/ProjectManager');
                const state = stateRef.current;
                // Only auto-save if there is actually data loaded
                if (state.customData || state.pinnedAllocations.length > 0) {
                    saveAutoSave(state);
                    showToast('Auto-save complete', 'info');
                }
            } catch (e) {
                console.warn('Auto-save failed:', e);
            }
        }, 5 * 60 * 1000); // 5 minutes

        return () => clearInterval(interval);
    }, [showToast]); // Only showToast as dependency

    const toggleExclusive = (name) => {
        setExclusiveAffiliates(prev =>
            prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
        );
    };

    const locations = useMemo(() => customData?.locations || [], [customData]);

    const totalCapacity = useMemo(() => {
        const locs = customData?.locations || [];
        return locs.reduce((sum, l) => sum + l.capacity, 0);
    }, [customData]);

    const clients = useMemo(() => {
        let baseClients = customData?.clients || [];
        if (useAdjustedCounts) {
            const targetTotalAttributes = totalCapacity * (targetUtilization / 100);
            return adjustClientCounts(baseClients, Math.floor(targetTotalAttributes));
        }
        return baseClients;
    }, [useAdjustedCounts, customData, totalCapacity, targetUtilization]);

    const handlePinClients = (clientNames, targetLocId) => {
        const targetLoc = locations.find(l => l.id === targetLocId);
        if (!targetLoc) return;

        // Use the RAW location capacity (not current remaining), since the optimizer
        // will re-run from scratch with pins taking priority over everything else.
        const capacityLimit = Math.floor(targetLoc.capacity * (targetUtilization / 100));

        // Only count OTHER pins already assigned to this location (not the ones we're about to add)
        const existingPins = pinnedAllocations.filter(p => p.locationId === targetLocId && !clientNames.includes(p.clientName));
        const existingPinLoad = existingPins.reduce((sum, p) => {
            const c = clients.find(cl => cl.name === p.clientName);
            return sum + (c ? c.batteries : 0);
        }, 0);

        const newLoadClients = clientNames.map(name => clients.find(c => c.name === name)).filter(Boolean);
        const newLoad = newLoadClients.reduce((sum, c) => sum + c.batteries, 0);

        if (existingPinLoad + newLoad > capacityLimit) {
            // Only show overflow if total pinned load exceeds raw capacity
            setOverflowState({
                primaryLocation: {
                    ...targetLoc,
                    currentUsage: existingPinLoad,
                    totalCapacity: targetLoc.capacity,
                    capacityToUse: capacityLimit
                },
                overflowClients: newLoadClients,
                existingPinsCount: existingPinLoad
            });
        } else {
            setPinnedAllocations(prev => {
                const filtered = prev.filter(p => !clientNames.includes(p.clientName));
                const newPins = clientNames.map(name => ({ clientName: name, locationId: targetLocId }));
                return [...filtered, ...newPins];
            });
            showToast(`Pinned ${clientNames.length} clients to ${targetLoc.name}`, 'success');
        }
    };

    const handleConfirmSplit = (fittingClients, overflowClients, overflowLocId) => {
        if (!overflowState) return;
        const { primaryLocation } = overflowState;

        setPinnedAllocations(prev => {
            const allNames = [...fittingClients, ...overflowClients].map(c => c.name);
            const filtered = prev.filter(p => !allNames.includes(p.clientName));

            const pinsPrimary = fittingClients.map(c => ({ clientName: c.name, locationId: primaryLocation.id }));
            const pinsOverflow = overflowClients.map(c => ({ clientName: c.name, locationId: overflowLocId }));

            return [...filtered, ...pinsPrimary, ...pinsOverflow];
        });

        showToast(`Split ${fittingClients.length + overflowClients.length} clients between ${primaryLocation.name} and backup`, 'success');
        setOverflowState(null);
    };

    const handleForcePrimary = (allClients) => {
        if (!overflowState) return;
        const { primaryLocation } = overflowState;

        setPinnedAllocations(prev => {
            const clientNames = allClients.map(c => c.name);
            const filtered = prev.filter(p => !clientNames.includes(p.clientName));
            const newPins = clientNames.map(name => ({ clientName: name, locationId: primaryLocation.id }));
            return [...filtered, ...newPins];
        });

        showToast(`Forced ${allClients.length} clients into ${primaryLocation.name}`, 'warning');
        setOverflowState(null);
    };

    const handleMasterReset = () => {
        if (confirm("⚠️ RESET WARNING ⚠️\n\nThis will clear the current session:\n- All pinned clients\n- Exclusive affiliate filters\n- Custom data imports\n- Target utilization (reset to 100%)\n\nSaved projects will NOT be deleted.\n\nAre you sure?")) {
            setPinnedAllocations([]);
            setExclusiveAffiliates([]);
            setTargetUtilization(100);
            setCustomData(null);
            setUseAdjustedCounts(false);
            setDistributionStrategy('default');
            setGlobalSearch("");
            setRunId(prev => prev + 1);
            try {
                const { setActiveProject } = require('@/components/ProjectManager');
                if (typeof window !== 'undefined') localStorage.removeItem('battery-optimizer-active-project');
            } catch (e) { /* ignore */ }
            showToast("Session cleared. Saved projects preserved.", "info");
        }
    };


    const { locations: allocatedLocations, clients: processedClients } = useMemo(() => {
        const effectiveTolerance = Math.max(0, 100 - targetUtilization);
        return allocateBatteries(
            clients,
            locations,
            exclusiveAffiliates,
            pinnedAllocations,
            effectiveTolerance,
            0,
            distributionStrategy
        );
    }, [clients, locations, exclusiveAffiliates, pinnedAllocations, runId, targetUtilization, distributionStrategy]);

    // Persist transient state for Print Manifest
    useEffect(() => {
        const state = stateRef.current;
        localStorage.setItem('optimizer-transient-state', JSON.stringify(state));
    }, [customData, pinnedAllocations, exclusiveAffiliates, targetUtilization, useAdjustedCounts]);

    // Update a client's battery count
    const updateClientBatteries = (clientName, newBatteries) => {
        setCustomData(prev => {
            if (!prev || !prev.clients) return prev;
            return {
                ...prev,
                clients: prev.clients.map(c =>
                    c.name === clientName ? { ...c, batteries: newBatteries } : c
                )
            };
        });
        setRunId(r => r + 1);
    };

    const [locationSort, setLocationSort] = useState('name-asc');

    // ... (existing code)

    // FILTERED LOCATIONS for Search & Sort
    const filteredLocations = useMemo(() => {
        let result = allocatedLocations;

        // 1. Filter by Search
        if (globalSearch.trim()) {
            const term = globalSearch.toLowerCase();
            result = result.filter(loc => {
                // Check location name
                if (loc.name.toLowerCase().includes(term)) return true;
                // Check clients in location
                if (loc.allocations.some(a => a.clientName.toLowerCase().includes(term))) return true;
                return false;
            });
        }

        // 2. Sort Results
        return [...result].sort((a, b) => {
            switch (locationSort) {
                case 'name-asc':
                    return a.name.localeCompare(b.name);
                case 'capacity-desc':
                    return b.capacity - a.capacity;
                case 'capacity-asc':
                    return a.capacity - b.capacity;
                case 'available-desc':
                    return b.remainingCapacity - a.remainingCapacity;
                case 'available-asc':
                    return a.remainingCapacity - b.remainingCapacity;
                case 'utilization-desc': {
                    const utilA = (a.capacity - a.remainingCapacity) / a.capacity;
                    const utilB = (b.capacity - b.remainingCapacity) / b.capacity;
                    return utilB - utilA;
                }
                default:
                    return 0;
            }
        });
    }, [allocatedLocations, globalSearch, locationSort]);

    // ... (existing code)


    const unallocatedClients = processedClients ? processedClients.filter(c => !c.allocated) : [];
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

        if (rows.length <= 1) {
            showToast('No data to export', 'error');
            return;
        }

        const csvContent = rows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `battery_manifest_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast(`Exported ${rows.length - 1} rows to CSV`, 'success');
    };

    // Data Debugging
    console.log('--- RENDER DEBUG ---');
    console.log('Locations:', locations.length);
    console.log('Clients:', clients.length);
    console.log('Allocated Locations:', allocatedLocations?.length);
    console.log('Filtered Locations:', filteredLocations?.length);
    console.log('View Mode:', viewMode);
    console.log('Global Search:', globalSearch);

    // --- Header Content ---
    const headerContent = (
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '24px' }}>

            {/* Metrics */}
            <div style={{ display: 'flex', gap: '32px', alignItems: 'center', flexShrink: 0 }}>
                <div title="Total Capacity">
                    <span style={{ fontSize: '0.75rem', display: 'block', color: 'var(--color-text-secondary)', fontWeight: '600', letterSpacing: '0.5px' }}>CAPACITY</span>
                    <span style={{ fontWeight: '700', fontSize: '1.25rem', color: 'var(--color-text-primary)' }}>{totalCapacity.toLocaleString()}</span>
                </div>
                <div title="Total Demand">
                    <span style={{ fontSize: '0.75rem', display: 'block', color: 'var(--color-text-secondary)', fontWeight: '600', letterSpacing: '0.5px' }}>DEMAND</span>
                    <span style={{ fontWeight: '700', fontSize: '1.25rem', color: totalDemand > totalCapacity ? 'var(--color-danger)' : 'var(--color-text-primary)' }}>
                        {totalDemand.toLocaleString()}
                    </span>
                </div>
                {/* Utilization Bar */}
                <div style={{ width: '150px', height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{
                        width: `${Math.min((totalDemand / totalCapacity) * 100, 100)}%`,
                        height: '100%',
                        backgroundColor: totalDemand > totalCapacity ? 'var(--color-danger)' : 'var(--color-primary)',
                        transition: 'width 0.5s ease-out'
                    }}></div>
                </div>
            </div>
        </div>
    );

    return (
        <DashboardLayout
            isSidebarOpen={isSidebarOpen}
            setIsSidebarOpen={setIsSidebarOpen}
            sidebarContent={
                <SidebarControls
                    targetUtilization={targetUtilization}
                    setTargetUtilization={setTargetUtilization}
                    useAdjustedCounts={useAdjustedCounts}
                    setUseAdjustedCounts={setUseAdjustedCounts}
                    totalCapacity={totalCapacity}
                    onRefresh={() => setRunId(prev => prev + 1)}
                    exclusiveAffiliates={exclusiveAffiliates}
                    toggleExclusive={toggleExclusive}
                    clients={clients}
                    locations={allocatedLocations}
                    pinnedAllocations={pinnedAllocations}
                    setPinnedAllocations={setPinnedAllocations}
                    onDataUpload={(data) => setCustomData(prev => ({ ...prev, ...data }))}
                    onReset={() => {
                        if (confirm('Reset to default data?\n\nThis will also clear all pinned clients and exclusive affiliate settings.')) {
                            setCustomData(null);
                            setPinnedAllocations([]);
                            setExclusiveAffiliates([]);
                            setRunId(prev => prev + 1);
                            showToast('Application reset to default data', 'info');
                        }
                    }}
                    onPinClients={handlePinClients}
                    onLoadState={(state) => {
                        setCustomData(state.customData || null);
                        setPinnedAllocations(state.pinnedAllocations || []);
                        setExclusiveAffiliates(state.exclusiveAffiliates || []);
                        setTargetUtilization(state.targetUtilization ?? 100);
                        setUseAdjustedCounts(state.useAdjustedCounts ?? false);
                        setDistributionStrategy(state.distributionStrategy || 'default');
                        setRunId(prev => prev + 1);
                        showToast('Project loaded', 'success');
                    }}
                    onNewProject={() => {
                        setPinnedAllocations([]);
                        setExclusiveAffiliates([]);
                        setTargetUtilization(100);
                        setCustomData(null);
                        setUseAdjustedCounts(false);
                        setDistributionStrategy('default');
                        setGlobalSearch('');
                        setRunId(prev => prev + 1);
                        showToast('Started new project', 'info');
                    }}
                    currentStateFn={() => ({
                        customData: customData || { locations, clients },
                        pinnedAllocations,
                        exclusiveAffiliates,
                        targetUtilization,
                        useAdjustedCounts
                    })}
                    onMasterReset={handleMasterReset}
                    onClearCustomizations={() => {
                        setPinnedAllocations([]);
                        setExclusiveAffiliates([]);
                        setRunId(prev => prev + 1);
                        showToast('Cleared all pins and exclusive affiliates', 'info');
                    }}
                    distributionStrategy={distributionStrategy}
                    setDistributionStrategy={setDistributionStrategy}
                />
            }
            headerContent={headerContent}
        >
            <div style={{ marginRight: (selectedLocation || selectedAffiliate) ? '416px' : '0', transition: 'margin-right 0.3s ease' }}>
                {/* Top Stats & View Switcher */}
                <div style={{ marginBottom: '24px' }}>

                    {/* Validation Stats (Full Width) */}
                    <div style={{ marginBottom: '16px' }}>
                        <ValidationStats
                            locations={allocatedLocations}
                            totalClients={clients.length}
                            unallocatedList={unallocatedClients}
                        />
                    </div>

                    {/* Controls Row: Search + View Toggle */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>

                        {/* Global Search Input */}
                        <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
                            <span style={{
                                position: 'absolute',
                                left: '12px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                color: '#94a3b8',
                                fontSize: '1rem'
                            }}>🔍</span>
                            <input
                                type="text"
                                placeholder="Search clients, affiliates, or locations..."
                                value={globalSearch}
                                onChange={(e) => setGlobalSearch(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '10px 12px 10px 40px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--color-border)',
                                    backgroundColor: 'var(--color-surface)',
                                    color: 'var(--color-text-primary)',
                                    fontSize: '0.9rem',
                                    outline: 'none',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                }}
                            />
                        </div>

                        {/* Order Sort Controls (Only for Locations View) */}
                        {viewMode === 'locations' && (
                            <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                                <select
                                    value={locationSort}
                                    onChange={(e) => setLocationSort(e.target.value)}
                                    style={{
                                        padding: '8px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid var(--color-border)',
                                        backgroundColor: 'var(--color-surface)',
                                        color: 'var(--color-text-primary)',
                                        fontSize: '0.85rem',
                                        outline: 'none',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <option value="name-asc">Sort by Name (A-Z)</option>
                                    <option value="capacity-desc">Capacity (High → Low)</option>
                                    <option value="capacity-asc">Capacity (Low → High)</option>
                                    <option value="available-desc">Availability (High → Low)</option>
                                    <option value="available-asc">Availability (Low → High)</option>
                                    <option value="utilization-desc">Utilization (High → Low)</option>
                                </select>
                            </div>
                        )}

                        {/* View Mode Toggle */}
                        <div style={{
                            backgroundColor: 'var(--color-surface)',
                            padding: '4px',
                            borderRadius: '8px',
                            border: '1px solid var(--color-border)',
                            display: 'flex',
                            gap: '4px',
                            height: 'fit-content'
                        }}>
                            <button
                                onClick={() => setViewMode('locations')}
                                className="btn"
                                style={{
                                    backgroundColor: viewMode === 'locations' ? '#eff6ff' : 'transparent',
                                    color: viewMode === 'locations' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                                    fontWeight: '600',
                                    fontSize: '0.875rem',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: '6px 12px',
                                    borderRadius: '6px'
                                }}
                            >
                                Locations
                            </button>
                            <button
                                onClick={() => setViewMode('affiliates')}
                                className="btn"
                                style={{
                                    backgroundColor: viewMode === 'affiliates' ? '#eff6ff' : 'transparent',
                                    color: viewMode === 'affiliates' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                                    fontWeight: '600',
                                    fontSize: '0.875rem',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: '6px 12px',
                                    borderRadius: '6px'
                                }}
                            >
                                Affiliates
                            </button>
                            <button
                                onClick={() => setViewMode('clients')}
                                className="btn"
                                style={{
                                    backgroundColor: viewMode === 'clients' ? '#eff6ff' : 'transparent',
                                    color: viewMode === 'clients' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                                    fontWeight: '600',
                                    fontSize: '0.875rem',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: '6px 12px',
                                    borderRadius: '6px'
                                }}
                            >
                                All Clients
                            </button>
                        </div>
                    </div>
                </div>

                {/* Blank state when no data is loaded */}
                {/* Blank state when no data is loaded */}
                {locations.length === 0 && clients.length === 0 ? (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '80px 40px',
                        textAlign: 'center'
                    }}>
                        <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📦</div>
                        <h2 style={{ margin: '0 0 8px 0', fontSize: '1.5rem', color: 'var(--color-text-primary)' }}>
                            No Project Loaded
                        </h2>
                        <p style={{ margin: '0 0 24px 0', color: 'var(--color-text-secondary)', maxWidth: '400px', lineHeight: '1.6' }}>
                            Open a saved project from the sidebar, or upload location and client CSV files to get started.
                        </p>
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
                            <div style={{
                                padding: '12px 20px',
                                backgroundColor: 'var(--color-surface)',
                                border: '1px solid var(--color-border)',
                                borderRadius: '8px',
                                fontSize: '0.85rem',
                                color: 'var(--color-text-secondary)'
                            }}>
                                💾 <strong>Open a project</strong> from the sidebar
                            </div>
                            <div style={{
                                padding: '12px 20px',
                                backgroundColor: 'var(--color-surface)',
                                border: '1px solid var(--color-border)',
                                borderRadius: '8px',
                                fontSize: '0.85rem',
                                color: 'var(--color-text-secondary)'
                            }}>
                                📁 <strong>Upload CSVs</strong> via Data Management
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Main Grid */}
                        {viewMode === 'locations' && (
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                                gap: '20px',
                                paddingBottom: '40px'
                            }}>
                                {filteredLocations.length === 0 && (
                                    <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', color: '#64748b' }}>
                                        No locations found matching "{globalSearch}"
                                    </div>
                                )}
                                {filteredLocations.map(loc => (
                                    <LocationCard
                                        key={loc.id}
                                        location={loc}
                                        onDropClients={(locId, clientNames) => {
                                            // Reusing handlePinClients logic but wrapped for drop interface
                                            handlePinClients(clientNames, locId);
                                        }}
                                        onCardClick={() => setSelectedLocation(loc)}
                                    />
                                ))}
                            </div>
                        )}

                        {viewMode === 'affiliates' && (
                            <div style={{ paddingBottom: '40px' }}>
                                <AffiliateSummary locations={filteredLocations} />
                                <AffiliateAllocations
                                    locations={filteredLocations}
                                    onAffiliateClick={setSelectedAffiliate}
                                />
                            </div>
                        )}

                        {viewMode === 'clients' && (
                            <ClientListView
                                clients={clients}
                                globalSearch={globalSearch}
                                locations={allocatedLocations}
                                onMoveClients={handlePinClients}
                            />
                        )}
                    </>
                )}
            </div>

            {/* Overlays */}
            {selectedLocation && (
                <LocationSidebar
                    location={selectedLocation}
                    onClose={() => setSelectedLocation(null)}
                    pinnedAllocations={pinnedAllocations}
                    setPinnedAllocations={setPinnedAllocations}
                    onUpdateBatteries={updateClientBatteries}
                />
            )}

            {selectedAffiliate && (
                <AffiliateSidebar
                    affiliate={selectedAffiliate}
                    onClose={() => setSelectedAffiliate(null)}
                />
            )}

            <OverflowModal
                isOpen={!!overflowState}
                onClose={() => setOverflowState(null)}
                primaryLocation={overflowState?.primaryLocation}
                overflowClients={overflowState?.overflowClients}
                allLocations={allocatedLocations}
                onConfirmSplit={handleConfirmSplit}
                onForcePrimary={handleForcePrimary}
            />
        </DashboardLayout>
    );
}
