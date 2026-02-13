'use client';
import React, { useState } from 'react';
import DataManagement from '../DataManagement';
import ProjectManager from '../ProjectManager';
import { getAffiliateColor } from '@/lib/theme';
import { useToast } from '@/contexts/ToastContext';

const ControlSection = ({ title, children, defaultOpen = true }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <div style={{ marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '16px' }}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'none',
                    border: 'none',
                    color: '#e2e8f0',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    marginBottom: isOpen ? '12px' : '0'
                }}
            >
                {title}
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{isOpen ? '▼' : '▶'}</span>
            </button>
            {isOpen && (
                <div style={{ animation: 'fadeIn 0.2s' }}>
                    {children}
                </div>
            )}
        </div>
    );
};

const SidebarControls = ({
    targetUtilization,
    setTargetUtilization,
    useAdjustedCounts,
    setUseAdjustedCounts,
    totalCapacity,
    onRefresh,
    exclusiveAffiliates,
    toggleExclusive,
    clients,
    locations,
    pinnedAllocations,
    setPinnedAllocations,
    onDataUpload,
    onReset,
    onPinClients,
    onLoadState,
    onNewProject,
    currentStateFn,
    onMasterReset
}) => {
    const { showToast } = useToast();
    const [pinSearch, setPinSearch] = useState("");
    const [selectedAffiliate, setSelectedAffiliate] = useState("");
    const [selectedPinClients, setSelectedPinClients] = useState(new Set());
    const [targetPinLocation, setTargetPinLocation] = useState("");

    // Derived state for pinning
    const uniqueAffiliates = Array.from(new Set(clients.map(c => c.affiliate))).sort();

    // Filter clients for pinning list
    const filteredClients = clients.filter(c => {
        const matchesAffiliate = selectedAffiliate ? c.affiliate === selectedAffiliate : true;
        const matchesSearch = c.name.toLowerCase().includes(pinSearch.toLowerCase());
        return matchesAffiliate && matchesSearch;
    }).sort((a, b) => a.name.localeCompare(b.name));

    const handlePinSubmit = () => {
        if (!targetPinLocation || selectedPinClients.size === 0) return;

        const clientNames = Array.from(selectedPinClients);

        if (onPinClients) {
            onPinClients(clientNames, targetPinLocation);
        } else {
            // Fallback
            setPinnedAllocations(prev => {
                const filtered = prev.filter(p => !clientNames.includes(p.clientName));
                const newPins = clientNames.map(name => ({ clientName: name, locationId: targetPinLocation }));
                return [...filtered, ...newPins];
            });
            showToast(`Pinned ${clientNames.length} clients to ${targetPinLocation}`, 'success');
        }

        setSelectedPinClients(new Set());
        setTargetPinLocation("");
    };

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            const allNames = new Set(filteredClients.map(c => c.name));
            setSelectedPinClients(allNames);
        } else {
            setSelectedPinClients(new Set());
        }
    };

    return (
        <div className="sidebar-controls">
            {/* Optimization Settings */}
            <ControlSection title="Optimization Settings">
                <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                        Target Utilization (%)
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                            type="range"
                            min="1"
                            max="100"
                            value={targetUtilization}
                            onChange={(e) => setTargetUtilization(Number(e.target.value))}
                            style={{ flex: 1 }}
                            aria-label="Target Utilization Percentage"
                        />
                        <span style={{ color: 'white', fontSize: '0.875rem', width: '30px', textAlign: 'right' }}>
                            {targetUtilization}%
                        </span>
                    </div>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '16px', fontSize: '0.875rem', color: '#e2e8f0' }}>
                    <input
                        type="checkbox"
                        checked={useAdjustedCounts}
                        onChange={(e) => setUseAdjustedCounts(e.target.checked)}
                    />
                    Scale to Fill Capacity
                </label>

                <button
                    onClick={() => {
                        onRefresh();
                        showToast('Re-running allocation algorithm...', 'info');
                    }}
                    style={{
                        width: '100%',
                        padding: '8px',
                        backgroundColor: 'var(--color-primary)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                    }}
                >
                    🔄 Re-Run Optimization
                </button>
            </ControlSection>

            {/* Segregation */}
            <ControlSection title="Exclusive Affiliates" defaultOpen={false}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
                    {uniqueAffiliates.map(aff => (
                        <label key={aff} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#cbd5e1', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={exclusiveAffiliates.includes(aff)}
                                onChange={() => toggleExclusive(aff)}
                            />
                            <span style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                backgroundColor: getAffiliateColor(aff),
                                display: 'inline-block'
                            }}></span>
                            {aff}
                        </label>
                    ))}
                </div>
            </ControlSection>

            {/* Manual Pinning */}
            <ControlSection title="Pin Clients" defaultOpen={false}>
                {/* Affiliate Filter */}
                <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                        Filter by Affiliate
                    </label>
                    <select
                        value={selectedAffiliate}
                        onChange={(e) => {
                            setSelectedAffiliate(e.target.value);
                            setPinSearch(""); // Clear text search if desired, or keep it to allow filtering within affiliate
                            setSelectedPinClients(new Set());
                        }}
                        style={{
                            width: '100%',
                            padding: '6px',
                            borderRadius: '4px',
                            backgroundColor: '#0f172a',
                            color: 'white',
                            border: '1px solid #475569',
                            fontSize: '0.8rem'
                        }}
                    >
                        <option value="">All Affiliates</option>
                        {uniqueAffiliates.map(aff => (
                            <option key={aff} value={aff}>{aff}</option>
                        ))}
                    </select>
                </div>

                {/* Search Input - Always Visible */}
                <div style={{ marginBottom: '8px' }}>
                    <input
                        type="text"
                        placeholder="Search clients..."
                        value={pinSearch}
                        onChange={(e) => setPinSearch(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '6px 8px',
                            borderRadius: '4px',
                            border: '1px solid #475569',
                            backgroundColor: '#0f172a',
                            color: 'white',
                            fontSize: '0.8rem'
                        }}
                    />
                </div>

                {/* Select All Checkbox */}
                {filteredClients.length > 0 && (
                    <div style={{ marginBottom: '8px', padding: '0 8px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.75rem', color: '#cbd5e1', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={filteredClients.length > 0 && selectedPinClients.size === filteredClients.length}
                                onChange={handleSelectAll}
                                style={{ marginRight: '6px' }}
                            />
                            Select All ({filteredClients.length})
                        </label>
                    </div>
                )}

                <div style={{
                    height: '150px',
                    overflowY: 'auto',
                    border: '1px solid #334155',
                    borderRadius: '4px',
                    marginBottom: '8px',
                    backgroundColor: '#0f172a'
                }}>
                    {filteredClients.length === 0 ? (
                        <div style={{ padding: '8px', color: '#64748b', fontSize: '0.75rem', textAlign: 'center' }}>
                            No clients found
                        </div>
                    ) : (
                        filteredClients.map(c => (
                            <label key={c.id || c.name} style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', fontSize: '0.75rem', color: '#cbd5e1', cursor: 'pointer', borderBottom: '1px solid #1e293b' }}>
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
                                <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                                <span style={{ color: '#64748b' }}>{c.batteries}</span>
                            </label>
                        ))
                    )}
                </div>

                <div style={{ marginBottom: '8px' }}>
                    <select
                        value={targetPinLocation}
                        onChange={(e) => setTargetPinLocation(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '6px',
                            borderRadius: '4px',
                            backgroundColor: '#0f172a',
                            color: 'white',
                            border: '1px solid #475569',
                            fontSize: '0.8rem'
                        }}
                    >
                        <option value="">Select Location...</option>
                        {locations.map(l => (
                            <option key={l.id} value={l.id}>{l.name} ({l.remainingCapacity} left)</option>
                        ))}
                    </select>
                </div>

                <button
                    onClick={handlePinSubmit}
                    disabled={selectedPinClients.size === 0 || !targetPinLocation}
                    style={{
                        width: '100%',
                        padding: '6px',
                        backgroundColor: selectedPinClients.size > 0 && targetPinLocation ? 'var(--color-success)' : '#334155',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '0.8rem',
                        cursor: selectedPinClients.size > 0 && targetPinLocation ? 'pointer' : 'not-allowed'
                    }}
                >
                    Pin Selection
                </button>
            </ControlSection>

            {/* Data Management */}
            <ControlSection title="Data Management" defaultOpen={false}>
                <DataManagement
                    onDataUpload={(data) => {
                        onDataUpload(data);
                        showToast('Custom data loaded successfully', 'success');
                    }}
                    onReset={() => {
                        onReset();
                    }}
                />
            </ControlSection>

            {/* Projects */}
            <div style={{
                borderTop: '1px solid rgba(255,255,255,0.1)',
                paddingTop: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
            }}>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600', marginBottom: '4px' }}>Projects</span>

                <ProjectManager
                    onLoadState={onLoadState}
                    onNewProject={onNewProject}
                    currentStateFn={currentStateFn}
                />

                <div style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.06)', margin: '4px 0' }}></div>

                <a
                    href="/print"
                    target="_blank"
                    style={{
                        padding: '10px 12px',
                        backgroundColor: '#0f172a',
                        color: '#e2e8f0',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: '500',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        textDecoration: 'none',
                        transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#1e293b'; e.currentTarget.style.borderColor = '#475569'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#0f172a'; e.currentTarget.style.borderColor = '#334155'; }}
                >
                    🖨️ Print / Export Manifest
                </a>

                <button
                    onClick={onMasterReset}
                    style={{
                        padding: '10px 12px',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        color: '#f87171',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: '500',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)'; }}
                >
                    🔄 Reset App
                </button>
            </div>
        </div>
    );
};

export default SidebarControls;
