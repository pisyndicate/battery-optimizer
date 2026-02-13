'use client';
import React, { useState, useMemo } from 'react';
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

    const toggleExclusive = (name) => {
        setExclusiveAffiliates(prev =>
            prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
        );
    };

    const locations = useMemo(() => customData?.locations || INITIAL_LOCATIONS, [customData]);

    const totalCapacity = useMemo(() => {
        const locs = customData?.locations || INITIAL_LOCATIONS;
        return locs.reduce((sum, l) => sum + l.capacity, 0);
    }, [customData]);

    const clients = useMemo(() => {
        let baseClients = customData?.clients || INITIAL_CLIENTS;
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
        if (confirm("⚠️ RESET ALL WARNING ⚠️\n\nThis will clear:\n- All pinned clients\n- Exclusive affiliate filters\n- Custom data imports\n- Target utilization (reset to 100%)\n\nAre you sure?")) {
            setPinnedAllocations([]);
            setExclusiveAffiliates([]);
            setTargetUtilization(100);
            setCustomData(null);
            setUseAdjustedCounts(false);
            setGlobalSearch("");
            setRunId(prev => prev + 1);
            showToast("Application has been fully reset.", "warning");
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
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '24px', alignItems: 'center', flex: 1 }}>

                {/* Search Bar */}
                <div style={{ position: 'relative', width: '300px' }}>
                    <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }}>🔍</span>
                    <input
                        type="text"
                        placeholder="Search Client or Location..."
                        value={globalSearch}
                        onChange={(e) => setGlobalSearch(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '8px 10px 8px 36px',
                            borderRadius: '6px',
                            border: '1px solid #e2e8f0',
                            backgroundColor: '#f8fafc',
                            fontSize: '0.9rem',
                            outline: 'none'
                        }}
                    />
                </div>

                {/* Metrics */}
                <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
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
                    <div style={{ width: '100px', height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{
                            width: `${Math.min((totalDemand / totalCapacity) * 100, 100)}%`,
                            height: '100%',
                            backgroundColor: totalDemand > totalCapacity ? 'var(--color-danger)' : 'var(--color-primary)',
                            transition: 'width 0.5s ease-out'
                        }}></div>
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
                <button
                    onClick={handleMasterReset}
                    className="btn"
                    style={{
                        display: 'flex',
                        gap: '8px',
                        backgroundColor: '#fee2e2',
                        color: '#ef4444',
                        border: '1px solid #fecaca',
                        fontWeight: '600'
                    }}
                    title="Reset Everything (Pins, Data, Settings)"
                >
                    <span>🔄</span> Reset App
                </button>
                <a
                    href="/print"
                    target="_blank"
                    className="btn btn-secondary"
                    style={{ textDecoration: 'none', display: 'flex', gap: '8px' }}
                >
                    <span>🖨️</span> Print
                </a>
                <button
                    onClick={handleExportCSV}
                    className="btn btn-primary"
                    style={{ display: 'flex', gap: '8px' }}
                >
                    <span>⬇</span> Export
                </button>
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
            )
            }

            {/* Overlays */}
            {
                selectedLocation && (
                    <LocationSidebar
                        location={selectedLocation}
                        onClose={() => setSelectedLocation(null)}
                    />
                )
            }

            {
                selectedAffiliate && (
                    <AffiliateSidebar
                        affiliate={selectedAffiliate}
                        onClose={() => setSelectedAffiliate(null)}
                    />
                )
            }

            <OverflowModal
                isOpen={!!overflowState}
                onClose={() => setOverflowState(null)}
                primaryLocation={overflowState?.primaryLocation}
                overflowClients={overflowState?.overflowClients}
                allLocations={allocatedLocations}
                onConfirmSplit={handleConfirmSplit}
                onForcePrimary={handleForcePrimary}
            />
        </DashboardLayout >
    );
}
