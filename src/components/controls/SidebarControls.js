'use client';
import React, { useState, useMemo } from 'react';
import DataManagement from '../DataManagement';
import ProjectManager from '../ProjectManager';
import { getAffiliateColor } from '@/lib/theme';
import { useToast } from '@/contexts/ToastContext';

// ─── Compact Section Header ────────────────────────────────
const Section = ({ title, badge, children, defaultOpen = true, noPad = false }) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <button
                onClick={() => setOpen(!open)}
                style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    fontSize: '0.7rem',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.6px',
                    cursor: 'pointer',
                    padding: '10px 0',
                }}
            >
                <span style={{
                    fontSize: '0.55rem',
                    transition: 'transform 0.15s',
                    transform: open ? 'rotate(90deg)' : 'rotate(0)',
                    color: '#475569'
                }}>▶</span>
                {title}
                {badge != null && (
                    <span style={{
                        fontSize: '0.65rem',
                        backgroundColor: 'rgba(99, 102, 241, 0.2)',
                        color: '#a5b4fc',
                        padding: '1px 6px',
                        borderRadius: '8px',
                        fontWeight: '600',
                        letterSpacing: '0'
                    }}>{badge}</span>
                )}
            </button>
            {open && (
                <div style={{ paddingBottom: '12px', paddingTop: noPad ? 0 : '2px' }}>
                    {children}
                </div>
            )}
        </div>
    );
};

// ─── Pill Tab Switcher ─────────────────────────────────────
const TabSwitcher = ({ tabs, active, onChange }) => (
    <div style={{
        display: 'flex',
        backgroundColor: 'rgba(0,0,0,0.25)',
        borderRadius: '6px',
        padding: '2px',
        marginBottom: '10px'
    }}>
        {tabs.map(t => (
            <button
                key={t.id}
                onClick={() => onChange(t.id)}
                style={{
                    flex: 1,
                    padding: '5px 0',
                    fontSize: '0.72rem',
                    fontWeight: active === t.id ? '600' : '400',
                    color: active === t.id ? '#e2e8f0' : '#64748b',
                    backgroundColor: active === t.id ? 'rgba(99,102,241,0.25)' : 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                }}
            >
                {t.label}
            </button>
        ))}
    </div>
);

// ─── Styled Select ─────────────────────────────────────────
const SidebarSelect = ({ value, onChange, children, ...rest }) => (
    <select
        value={value}
        onChange={onChange}
        style={{
            width: '100%',
            padding: '7px 8px',
            borderRadius: '6px',
            backgroundColor: 'rgba(0,0,0,0.3)',
            color: '#e2e8f0',
            border: '1px solid rgba(255,255,255,0.08)',
            fontSize: '0.78rem',
            outline: 'none',
            appearance: 'auto'
        }}
        {...rest}
    >
        {children}
    </select>
);

// ─── Action Button ─────────────────────────────────────────
const ActionBtn = ({ children, onClick, disabled, variant = 'primary', small = false, ...rest }) => {
    const vars = {
        primary: { bg: 'var(--color-primary)', hoverBg: 'var(--color-primary)', color: '#fff' },
        success: { bg: 'var(--color-success)', hoverBg: 'var(--color-success)', color: '#fff' },
        ghost: { bg: 'transparent', hoverBg: 'rgba(255,255,255,0.05)', color: '#94a3b8' },
        warn: { bg: 'rgba(251,191,36,0.1)', hoverBg: 'rgba(251,191,36,0.2)', color: '#fbbf24' },
        danger: { bg: 'rgba(239,68,68,0.1)', hoverBg: 'rgba(239,68,68,0.2)', color: '#f87171' },
    };
    const v = vars[variant];
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            style={{
                width: '100%',
                padding: small ? '6px 8px' : '8px 10px',
                backgroundColor: disabled ? 'rgba(255,255,255,0.04)' : v.bg,
                color: disabled ? '#475569' : v.color,
                border: variant === 'ghost' ? '1px solid rgba(255,255,255,0.08)' : 'none',
                borderRadius: '6px',
                cursor: disabled ? 'not-allowed' : 'pointer',
                fontSize: small ? '0.72rem' : '0.78rem',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'all 0.15s',
                opacity: disabled ? 0.5 : 1
            }}
            onMouseEnter={e => { if (!disabled) e.currentTarget.style.backgroundColor = v.hoverBg; e.currentTarget.style.filter = 'brightness(1.15)'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = disabled ? 'rgba(255,255,255,0.04)' : v.bg; e.currentTarget.style.filter = ''; }}
            {...rest}
        >
            {children}
        </button>
    );
};


// ═══════════════════════════════════════════════════════════
//  MAIN SIDEBAR
// ═══════════════════════════════════════════════════════════
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
    onMasterReset,
    onClearCustomizations
}) => {
    const { showToast } = useToast();

    // ── Pinning State ──────────────────────────────────
    const [pinTab, setPinTab] = useState('bulk');
    const [pinSearch, setPinSearch] = useState("");
    const [selectedAffiliate, setSelectedAffiliate] = useState("");
    const [selectedPinClients, setSelectedPinClients] = useState(new Set());
    const [targetPinLocation, setTargetPinLocation] = useState("");

    const uniqueAffiliates = useMemo(() =>
        Array.from(new Set(clients.map(c => c.affiliate))).sort(),
        [clients]
    );

    const filteredClients = useMemo(() =>
        clients.filter(c => {
            const matchesAffiliate = selectedAffiliate ? c.affiliate === selectedAffiliate : true;
            const matchesSearch = c.name.toLowerCase().includes(pinSearch.toLowerCase());
            return matchesAffiliate && matchesSearch;
        }).sort((a, b) => a.name.localeCompare(b.name)),
        [clients, selectedAffiliate, pinSearch]
    );

    // ── Pin Summary ────────────────────────────────────
    const pinSummary = useMemo(() => {
        const byLoc = {};
        pinnedAllocations.forEach(pin => {
            if (!byLoc[pin.locationId]) byLoc[pin.locationId] = [];
            const client = clients.find(c => c.name === pin.clientName);
            byLoc[pin.locationId].push({
                ...pin,
                batteries: client ? client.batteries : 0,
            });
        });
        return Object.entries(byLoc).sort((a, b) => a[0].localeCompare(b[0])).map(([locId, pins]) => {
            const loc = locations.find(l => l.id === locId);
            return {
                locId,
                locName: loc ? loc.name : locId,
                pins: pins.sort((a, b) => b.batteries - a.batteries),
                totalUnits: pins.reduce((s, p) => s + p.batteries, 0)
            };
        });
    }, [pinnedAllocations, clients, locations]);

    // ── Handlers ───────────────────────────────────────
    const handlePinSubmit = () => {
        if (!targetPinLocation || selectedPinClients.size === 0) return;
        const names = Array.from(selectedPinClients);
        if (onPinClients) {
            onPinClients(names, targetPinLocation);
        } else {
            setPinnedAllocations(prev => {
                const filtered = prev.filter(p => !names.includes(p.clientName));
                return [...filtered, ...names.map(name => ({ clientName: name, locationId: targetPinLocation }))];
            });
            showToast(`Pinned ${names.length} clients`, 'success');
        }
        setSelectedPinClients(new Set());
        setTargetPinLocation("");
    };

    const handleBulkPin = () => {
        if (!selectedAffiliate || !targetPinLocation) return;
        const clientsToPin = clients.filter(c => c.affiliate === selectedAffiliate).map(c => c.name);
        if (onPinClients) onPinClients(clientsToPin, targetPinLocation);
        setSelectedAffiliate("");
        setTargetPinLocation("");
        showToast(`Pinned ${clientsToPin.length} clients from ${selectedAffiliate}`, 'success');
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

            {/* ── Scrollable content ───────────────────── */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>

                {/* ═══ OPTIMIZATION ═══ */}
                <Section title="Optimization">
                    <div style={{ marginBottom: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Target Utilization</span>
                            <span style={{ fontSize: '0.78rem', color: '#e2e8f0', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>
                                {targetUtilization}%
                            </span>
                        </div>
                        <input
                            type="range"
                            min="1"
                            max="100"
                            value={targetUtilization}
                            onChange={(e) => setTargetUtilization(Number(e.target.value))}
                            style={{ width: '100%', accentColor: 'var(--color-primary)' }}
                        />
                    </div>

                    <label style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '0.78rem',
                        color: '#cbd5e1',
                        cursor: 'pointer',
                        marginBottom: '12px',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        backgroundColor: useAdjustedCounts ? 'rgba(99,102,241,0.1)' : 'transparent',
                        transition: 'background-color 0.15s'
                    }}>
                        <input
                            type="checkbox"
                            checked={useAdjustedCounts}
                            onChange={(e) => setUseAdjustedCounts(e.target.checked)}
                            style={{ accentColor: 'var(--color-primary)' }}
                        />
                        Scale to Fill Capacity
                    </label>

                    <ActionBtn onClick={() => { onRefresh(); showToast('Re-running allocation...', 'info'); }}>
                        🔄 Re-Run Optimization
                    </ActionBtn>
                </Section>

                {/* ═══ EXCLUSIVE AFFILIATES ═══ */}
                <Section title="Exclusive Affiliates" badge={exclusiveAffiliates.length || null} defaultOpen={false}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '180px', overflowY: 'auto' }}>
                        {uniqueAffiliates.map(aff => {
                            const isActive = exclusiveAffiliates.includes(aff);
                            return (
                                <label key={aff} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    fontSize: '0.78rem',
                                    color: isActive ? '#e2e8f0' : '#94a3b8',
                                    cursor: 'pointer',
                                    padding: '5px 8px',
                                    borderRadius: '4px',
                                    backgroundColor: isActive ? 'rgba(99,102,241,0.1)' : 'transparent',
                                    transition: 'all 0.1s'
                                }}>
                                    <input
                                        type="checkbox"
                                        checked={isActive}
                                        onChange={() => toggleExclusive(aff)}
                                        style={{ accentColor: 'var(--color-primary)' }}
                                    />
                                    <span style={{
                                        width: '8px', height: '8px',
                                        borderRadius: '50%',
                                        backgroundColor: getAffiliateColor(aff),
                                        flexShrink: 0
                                    }}></span>
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{aff}</span>
                                </label>
                            );
                        })}
                    </div>
                </Section>

                {/* ═══ PINNING ═══ */}
                <Section
                    title="Pin Management"
                    badge={pinnedAllocations.length || null}
                    defaultOpen={pinnedAllocations.length > 0}
                >
                    {/* Active Pins compact summary */}
                    {pinnedAllocations.length > 0 && (
                        <div style={{ marginBottom: '12px' }}>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '6px'
                            }}>
                                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Active Pins</span>
                                <button
                                    onClick={onClearCustomizations}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#f87171',
                                        fontSize: '0.68rem',
                                        cursor: 'pointer',
                                        padding: '2px 4px',
                                        opacity: 0.7
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                    onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}
                                >
                                    Clear All
                                </button>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '200px', overflowY: 'auto' }}>
                                {pinSummary.map(({ locId, locName, pins, totalUnits }) => (
                                    <PinLocationGroup
                                        key={locId}
                                        locId={locId}
                                        locName={locName}
                                        pins={pins}
                                        totalUnits={totalUnits}
                                        setPinnedAllocations={setPinnedAllocations}
                                        showToast={showToast}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Add Pins */}
                    <div style={{
                        backgroundColor: 'rgba(0,0,0,0.15)',
                        borderRadius: '6px',
                        padding: '10px',
                        border: '1px solid rgba(255,255,255,0.04)'
                    }}>
                        <TabSwitcher
                            tabs={[
                                { id: 'bulk', label: '🏢 By Affiliate' },
                                { id: 'individual', label: '👤 Individual' }
                            ]}
                            active={pinTab}
                            onChange={setPinTab}
                        />

                        {pinTab === 'bulk' ? (
                            /* ── Bulk Pin by Affiliate ── */
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <SidebarSelect
                                    value={selectedAffiliate}
                                    onChange={(e) => setSelectedAffiliate(e.target.value)}
                                >
                                    <option value="">Select Affiliate...</option>
                                    {uniqueAffiliates.map(aff => (
                                        <option key={aff} value={aff}>{aff}</option>
                                    ))}
                                </SidebarSelect>

                                <SidebarSelect
                                    value={targetPinLocation}
                                    onChange={(e) => setTargetPinLocation(e.target.value)}
                                >
                                    <option value="">Target Location...</option>
                                    {locations.map(l => (
                                        <option key={l.id} value={l.id}>{l.name} ({l.remainingCapacity} avail)</option>
                                    ))}
                                </SidebarSelect>

                                <ActionBtn
                                    onClick={handleBulkPin}
                                    disabled={!selectedAffiliate || !targetPinLocation}
                                    variant="success"
                                    small
                                >
                                    📌 Pin All {selectedAffiliate ? `(${clients.filter(c => c.affiliate === selectedAffiliate).length})` : ''}
                                </ActionBtn>
                            </div>
                        ) : (
                            /* ── Individual Pin ── */
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <SidebarSelect
                                        value={selectedAffiliate}
                                        onChange={(e) => {
                                            setSelectedAffiliate(e.target.value);
                                            setSelectedPinClients(new Set());
                                        }}
                                        style={{ flex: 1, padding: '5px 6px', fontSize: '0.72rem' }}
                                    >
                                        <option value="">All Affiliates</option>
                                        {uniqueAffiliates.map(aff => (
                                            <option key={aff} value={aff}>{aff}</option>
                                        ))}
                                    </SidebarSelect>
                                    <input
                                        type="text"
                                        placeholder="Search..."
                                        value={pinSearch}
                                        onChange={(e) => setPinSearch(e.target.value)}
                                        style={{
                                            flex: 1,
                                            padding: '5px 8px',
                                            borderRadius: '6px',
                                            border: '1px solid rgba(255,255,255,0.08)',
                                            backgroundColor: 'rgba(0,0,0,0.3)',
                                            color: '#e2e8f0',
                                            fontSize: '0.72rem',
                                            outline: 'none'
                                        }}
                                    />
                                </div>

                                {/* Select All */}
                                {filteredClients.length > 0 && (
                                    <label style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        fontSize: '0.7rem',
                                        color: '#64748b',
                                        cursor: 'pointer',
                                        padding: '0 4px'
                                    }}>
                                        <input
                                            type="checkbox"
                                            checked={filteredClients.length > 0 && selectedPinClients.size === filteredClients.length}
                                            onChange={(e) => {
                                                setSelectedPinClients(e.target.checked ? new Set(filteredClients.map(c => c.name)) : new Set());
                                            }}
                                            style={{ accentColor: 'var(--color-primary)' }}
                                        />
                                        Select All ({filteredClients.length})
                                    </label>
                                )}

                                {/* Client List */}
                                <div style={{
                                    height: '130px',
                                    overflowY: 'auto',
                                    borderRadius: '4px',
                                    backgroundColor: 'rgba(0,0,0,0.2)',
                                    border: '1px solid rgba(255,255,255,0.04)'
                                }}>
                                    {filteredClients.length === 0 ? (
                                        <div style={{ padding: '12px', color: '#475569', fontSize: '0.72rem', textAlign: 'center' }}>
                                            No clients found
                                        </div>
                                    ) : (
                                        filteredClients.map(c => (
                                            <label key={c.id || c.name} style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                padding: '3px 8px',
                                                fontSize: '0.72rem',
                                                color: selectedPinClients.has(c.name) ? '#e2e8f0' : '#94a3b8',
                                                cursor: 'pointer',
                                                backgroundColor: selectedPinClients.has(c.name) ? 'rgba(99,102,241,0.08)' : 'transparent',
                                                transition: 'background-color 0.1s'
                                            }}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedPinClients.has(c.name)}
                                                    onChange={() => {
                                                        const s = new Set(selectedPinClients);
                                                        s.has(c.name) ? s.delete(c.name) : s.add(c.name);
                                                        setSelectedPinClients(s);
                                                    }}
                                                    style={{ marginRight: '6px', accentColor: 'var(--color-primary)' }}
                                                />
                                                <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                                                <span style={{ color: '#475569', fontSize: '0.68rem', flexShrink: 0, marginLeft: '4px' }}>{c.batteries}</span>
                                            </label>
                                        ))
                                    )}
                                </div>

                                <SidebarSelect
                                    value={targetPinLocation}
                                    onChange={(e) => setTargetPinLocation(e.target.value)}
                                >
                                    <option value="">Target Location...</option>
                                    {locations.map(l => (
                                        <option key={l.id} value={l.id}>{l.name} ({l.remainingCapacity} avail)</option>
                                    ))}
                                </SidebarSelect>

                                <ActionBtn
                                    onClick={handlePinSubmit}
                                    disabled={selectedPinClients.size === 0 || !targetPinLocation}
                                    variant="success"
                                    small
                                >
                                    📌 Pin Selection ({selectedPinClients.size})
                                </ActionBtn>
                            </div>
                        )}
                    </div>
                </Section>

                {/* ═══ DATA MANAGEMENT ═══ */}
                <Section title="Data" defaultOpen={false}>
                    <DataManagement
                        onDataUpload={(data) => {
                            onDataUpload(data);
                            showToast('Custom data loaded successfully', 'success');
                        }}
                        onReset={() => onReset()}
                    />
                </Section>

                {/* ═══ PROJECTS ═══ */}
                <Section title="Projects" defaultOpen={true} noPad>
                    <ProjectManager
                        onLoadState={onLoadState}
                        onNewProject={onNewProject}
                        currentStateFn={currentStateFn}
                    />
                </Section>

            </div>

            {/* ── Persistent Footer Actions ────────────── */}
            <div style={{
                borderTop: '1px solid rgba(255,255,255,0.08)',
                padding: '10px 0 0',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                flexShrink: 0
            }}>
                <a
                    href="/print"
                    target="_blank"
                    style={{
                        padding: '8px',
                        backgroundColor: 'rgba(0,0,0,0.2)',
                        color: '#cbd5e1',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        textDecoration: 'none',
                        transition: 'all 0.15s',
                        cursor: 'pointer'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.2)'; }}
                >
                    🖨️ Print / Export
                </a>

                <div style={{ display: 'flex', gap: '6px' }}>
                    <ActionBtn onClick={onClearCustomizations} variant="warn" small>
                        🧹 Clear Pins
                    </ActionBtn>
                    <ActionBtn onClick={onMasterReset} variant="danger" small>
                        🔄 Reset App
                    </ActionBtn>
                </div>
            </div>
        </div>
    );
};


// ─── Pin Location Group (collapsible) ──────────────────────
const PinLocationGroup = ({ locId, locName, pins, totalUnits, setPinnedAllocations, showToast }) => {
    const [expanded, setExpanded] = useState(false);

    return (
        <div style={{
            backgroundColor: 'rgba(99,102,241,0.06)',
            border: '1px solid rgba(99,102,241,0.12)',
            borderRadius: '6px',
            overflow: 'hidden'
        }}>
            <button
                onClick={() => setExpanded(!expanded)}
                style={{
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '6px 8px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#a5b4fc',
                    fontSize: '0.72rem',
                    fontWeight: '500'
                }}
            >
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '0.55rem', transition: 'transform 0.15s', transform: expanded ? 'rotate(90deg)' : 'rotate(0)' }}>▶</span>
                    📍 {locName}
                </span>
                <span style={{ color: '#64748b', fontSize: '0.68rem', fontWeight: '400' }}>
                    {pins.length} · {totalUnits.toLocaleString()}
                </span>
            </button>

            {expanded && (
                <div style={{
                    padding: '2px 0 4px',
                    borderTop: '1px solid rgba(99,102,241,0.08)',
                    maxHeight: '400px',
                    overflowY: 'auto'
                }}>
                    {pins.map(pin => (
                        <div key={pin.clientName} style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '2px 8px 2px 20px',
                            fontSize: '0.68rem',
                            color: '#94a3b8'
                        }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                {pin.clientName}
                            </span>
                            <span style={{ color: '#475569', fontSize: '0.65rem', marginRight: '6px', flexShrink: 0 }}>
                                {pin.batteries}
                            </span>
                            <button
                                onClick={() => {
                                    setPinnedAllocations(prev =>
                                        prev.filter(p => !(p.clientName === pin.clientName && p.locationId === pin.locationId))
                                    );
                                    showToast(`Unpinned ${pin.clientName}`, 'info');
                                }}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#ef4444',
                                    cursor: 'pointer',
                                    padding: '0 2px',
                                    fontSize: '0.75rem',
                                    lineHeight: 1,
                                    opacity: 0.5,
                                    flexShrink: 0
                                }}
                                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}
                                title={`Unpin ${pin.clientName}`}
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};


export default SidebarControls;
