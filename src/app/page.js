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

    // Ref for auto-save state to avoid interval reset and hook errors
    const stateRef = React.useRef({ customData, pinnedAllocations, exclusiveAffiliates, targetUtilization, useAdjustedCounts });
    stateRef.current = { customData, pinnedAllocations, exclusiveAffiliates, targetUtilization, useAdjustedCounts };

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

        const allocatedLoc = allocatedLocations.find(l => l.id === targetLocId);
        // Use effectiveCapacity if available (from optimizer), else fallback to raw utilization calc
        const capacityLimit = allocatedLoc ? (allocatedLoc.effectiveCapacity || allocatedLoc.capacity) : Math.floor(targetLoc.capacity * (targetUtilization / 100));

        const existingPins = pinnedAllocations.filter(p => p.locationId === targetLocId && !clientNames.includes(p.clientName));
        const existingLoad = existingPins.reduce((sum, p) => {
            const c = clients.find(cl => cl.name === p.clientName);
            return sum + (c ? c.batteries : 0);
        }, 0);

        const newLoadClients = clientNames.map(name => clients.find(c => c.name === name)).filter(Boolean);
        const newLoad = newLoadClients.reduce((sum, c) => sum + c.batteries, 0);

        if (existingLoad + newLoad > capacityLimit) {
            setOverflowState({
                primaryLocation: {
                    ...targetLoc,
                    currentUsage: existingLoad,
                    totalCapacity: targetLoc.capacity,
                    capacityToUse: capacityLimit
                },
                overflowClients: newLoadClients,
                existingPinsCount: existingLoad
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
            0
        );
    }, [clients, locations, exclusiveAffiliates, pinnedAllocations, runId, targetUtilization]);

    // Persist transient state for Print Manifest
    useEffect(() => {
        const state = stateRef.current;
        localStorage.setItem('optimizer-transient-state', JSON.stringify(state));
    }, [customData, pinnedAllocations, exclusiveAffiliates, targetUtilization, useAdjustedCounts]);

    // FILTERED LOCATIONS for Search
    const filteredLocations = useMemo(() => {
        if (!globalSearch.trim()) return allocatedLocations;

        const term = globalSearch.toLowerCase();
        return allocatedLocations.filter(loc => {
            // Check location name
            if (loc.name.toLowerCase().includes(term)) return true;
            // Check clients in location
            if (loc.allocations.some(a => a.clientName.toLowerCase().includes(term))) return true;
            return false;
        });
    }, [allocatedLocations, globalSearch]);


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
                    locations={locations}
                    pinnedAllocations={pinnedAllocations}
                    setPinnedAllocations={setPinnedAllocations}
                    onDataUpload={(data) => setCustomData(prev => ({ ...prev, ...data }))}
                    onReset={() => {
                        if (confirm('Reset to default data?')) {
                            setCustomData(null);
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
                        setRunId(prev => prev + 1);
                        showToast('Project loaded', 'success');
                    }}
                    onNewProject={() => {
                        setPinnedAllocations([]);
                        setExclusiveAffiliates([]);
                        setTargetUtilization(100);
                        setCustomData(null);
                        setUseAdjustedCounts(false);
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
                />
            }
            headerContent={headerContent}
        >
            {/* Top Stats & View Switcher */}
            <div style={{ marginBottom: '24px', display: 'flex', gap: '24px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }}>
                    <ValidationStats
                        locations={allocatedLocations}
                        totalClients={clients.length}
                        unallocatedList={unallocatedClients}
                    />
                </div>
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
                            border: 'none'
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
                            border: 'none'
                        }}
                    >
                        Affiliates
                    </button>
                </div>
            </div>

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
                    {viewMode === 'locations' ? (
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
                    ) : (
                        <div style={{ paddingBottom: '40px' }}>
                            <AffiliateSummary locations={filteredLocations} />
                            <AffiliateAllocations
                                locations={filteredLocations}
                                onAffiliateClick={setSelectedAffiliate}
                            />
                        </div>
                    )}
                </>
            )}

            {/* Overlays */}
            {selectedLocation && (
                <LocationSidebar
                    location={selectedLocation}
                    onClose={() => setSelectedLocation(null)}
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
