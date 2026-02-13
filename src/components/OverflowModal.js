import React, { useState, useEffect } from 'react';

const OverflowModal = ({
    isOpen,
    onClose,
    primaryLocation,
    overflowClients,
    allLocations,
    onConfirmSplit,
    onForcePrimary
}) => {
    const [overflowLocationId, setOverflowLocationId] = useState('');

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setOverflowLocationId('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const capacityToFill = primaryLocation.expectedCapacity - primaryLocation.currentUsage;
    // Ensure we don't show negative capacity if it's already over
    const safeCapacityToFill = Math.max(0, capacityToFill);

    // Clients that fit are the first N that sum up to <= safeCapacityToFill? 
    // Or just count? The prompt implies we put "remaining" elsewhere.
    // For simplicity, let's assume `overflowClients` contains *all* clients being assigned,
    // and we need to calculate how many fit vs how many overflow.
    // BUT the prompt says "if it goes over then it needs to let me select where to put the remaining".
    // So `overflowClients` should probably be the list of clients *that cause the overflow*, 
    // or we pass the full list and do the math here. 
    // Let's assume the parent does the math and passes `fittingClients` vs `overflowingClients`?
    // Actually, `primaryLoc` has `remainingCapacity`.
    // Let's assume `overflowClients` is the list of clients that *would not fit* or the *entire batch*?
    // Let's refactor:
    // The parent (page.js) will detect overflow.
    // It will calculate:
    // - `clientsToPrimary`: The subset that fits (or the user might want to adjust this?)
    // - `clientsToOverflow`: The rest.
    // This might be complex logic for a modal.

    // Simpler approach:
    // The modal receives the *entire batch* of clients the user tried to pin (`pendingClients`).
    // It calculates the split based on `primaryLocation.remainingCapacity`.
    // Then allows the user to confirm.

    const pendingClients = overflowClients || []; // Renaming for clarity in logic below

    // Simple greedy allocation for "fitting"
    let fittedCount = 0;
    let fittedBatteries = 0;
    let overflowCount = 0;
    let overflowBatteries = 0;

    // We need to know battery size per client. 
    // If we just pass simple objects with {name, batteries}, we can calculate.

    const remainingCap = primaryLocation.totalCapacity - primaryLocation.currentUsage;
    // Note: Use totalCapacity or targetCapacity? 
    // The user said "if it goes over then it needs to let me select where to put the remaining".
    // Usually "over" means over the *target* utilization.
    // Let's use `primaryLocation.capacityToUse` (the effective target capacity).

    const targetLimit = primaryLocation.capacityToUse;
    const currentUsage = primaryLocation.currentUsage;
    let roomLeft = targetLimit - currentUsage;

    const clientsFitting = [];
    const clientsOverflowing = [];

    pendingClients.forEach(client => {
        if (roomLeft >= client.batteries) {
            clientsFitting.push(client);
            roomLeft -= client.batteries;
            fittedBatteries += client.batteries;
        } else {
            clientsOverflowing.push(client);
            overflowBatteries += client.batteries;
        }
    });

    fittedCount = clientsFitting.length;
    overflowCount = clientsOverflowing.length;

    // Filter locations for overflow (exclude primary)
    const availableLocations = allLocations.filter(l => l.id !== primaryLocation.id && l.id !== 'unallocated');

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
        }}>
            <div style={{
                backgroundColor: '#1e293b',
                padding: '24px',
                borderRadius: '8px',
                minWidth: '500px',
                maxWidth: '90%',
                color: '#e2e8f0',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)'
            }}>
                <h2 style={{ marginTop: 0, color: 'var(--color-warning, #f59e0b)' }}>Capacity Limit Exceeded</h2>

                <p style={{ marginBottom: '20px' }}>
                    Adding <strong>{pendingClients.length}</strong> clients ({pendingClients.reduce((sum, c) => sum + c.batteries, 0)} batteries)
                    to <strong>{primaryLocation.name}</strong> will exceed its target capacity.
                </p>

                <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#0f172a', borderRadius: '6px' }}>
                    <h3 style={{ fontSize: '1rem', marginTop: 0, marginBottom: '12px' }}>Recommended Split:</h3>

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span>To <strong>{primaryLocation.name}</strong>:</span>
                        <span style={{ color: 'var(--color-success, #22c55e)' }}>{fittedCount} clients ({fittedBatteries} batteries)</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Remaining Overflow:</span>
                        <span style={{ color: 'var(--color-danger, #ef4444)' }}>{overflowCount} clients ({overflowBatteries} batteries)</span>
                    </div>
                </div>

                <div style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>
                        Select Destination for Remaining {overflowCount} Clients:
                    </label>
                    <select
                        value={overflowLocationId}
                        onChange={(e) => setOverflowLocationId(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '10px',
                            borderRadius: '4px',
                            backgroundColor: '#334155',
                            color: 'white',
                            border: '1px solid #475569'
                        }}
                    >
                        <option value="">-- Select Backup Location --</option>
                        {availableLocations.map(loc => (
                            <option key={loc.id} value={loc.id}>
                                {loc.name} (Has {Math.max(0, loc.capacityToUse - loc.currentUsage)} cap left)
                            </option>
                        ))}
                    </select>
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '4px',
                            border: '1px solid #475569',
                            backgroundColor: 'transparent',
                            color: '#cbd5e1',
                            cursor: 'pointer'
                        }}
                    >
                        Cancel
                    </button>

                    <button
                        onClick={() => onForcePrimary(pendingClients)}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '4px',
                            border: 'none',
                            backgroundColor: '#dc2626',
                            color: 'white',
                            cursor: 'pointer'
                        }}
                    >
                        Force All into {primaryLocation.name}
                    </button>

                    <button
                        onClick={() => onConfirmSplit(clientsFitting, clientsOverflowing, overflowLocationId)}
                        disabled={!overflowLocationId && overflowCount > 0}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '4px',
                            border: 'none',
                            backgroundColor: (!overflowLocationId && overflowCount > 0) ? '#475569' : 'var(--color-primary, #3b82f6)',
                            color: 'white',
                            cursor: (!overflowLocationId && overflowCount > 0) ? 'not-allowed' : 'pointer'
                        }}
                    >
                        Confirm Split
                    </button>
                </div>
            </div>
        </div>
    );
};

export default OverflowModal;
