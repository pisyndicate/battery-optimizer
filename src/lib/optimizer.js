import { INITIAL_CLIENTS, INITIAL_LOCATIONS } from './data';

export const allocateBatteries = (inputClients, inputLocations, exclusiveAffiliateNames = [], pinnedAllocations = [], toleranceMin = 0, toleranceMax = 0) => {
    const MAX_RETRIES = 10;
    let retryCount = 0;
    let capacityBoost = 0; // Progressively relax target on retries

    while (retryCount <= MAX_RETRIES) {
        // Deep copy fresh state each attempt
        let clients = JSON.parse(JSON.stringify(inputClients));
        const limitFactor = Math.min(1, ((100 - toleranceMin) / 100) + capacityBoost);

        let locations = JSON.parse(JSON.stringify(inputLocations)).map(l => {
            const effectiveCapacity = Math.floor(l.capacity * limitFactor);
            return {
                ...l,
                allocations: [],
                originalCapacity: l.capacity,
                effectiveCapacity: effectiveCapacity,
                remainingCapacity: effectiveCapacity,
                affiliatesHosted: new Set(),
                exclusiveOwner: null
            };
        });

        // ============================================================
        // PASS 1: Pinned Clients & Exclusive Affiliates
        // ============================================================

        // 1a. Place pinned clients first (they override everything)
        if (pinnedAllocations.length > 0) {
            pinnedAllocations.forEach(pin => {
                const client = clients.find(c => c.name === pin.clientName);
                const location = locations.find(l => l.id === pin.locationId);
                if (client && location) {
                    location.allocations.push({
                        clientId: client.id,
                        clientName: client.name,
                        amount: client.batteries,
                        affiliate: client.affiliate
                    });
                    location.remainingCapacity -= client.batteries;
                    location.affiliatesHosted.add(client.affiliate);
                    client.allocated = true;
                    client.locationId = location.id;
                    if (exclusiveAffiliateNames.includes(client.affiliate)) {
                        location.exclusiveOwner = client.affiliate;
                    }
                }
            });
        }

        // 1b. Place exclusive affiliate groups
        const affiliateGroups = {};
        clients.forEach(c => {
            if (c.allocated) return;
            if (!affiliateGroups[c.affiliate]) affiliateGroups[c.affiliate] = [];
            affiliateGroups[c.affiliate].push(c);
        });

        const exclusiveGroups = Object.entries(affiliateGroups)
            .filter(([name]) => exclusiveAffiliateNames.includes(name))
            .map(([name, group]) => ({
                name,
                clients: group,
                totalDemand: group.reduce((sum, c) => sum + c.batteries, 0)
            }))
            .sort((a, b) => a.totalDemand - b.totalDemand); // Smallest first for better packing

        for (let group of exclusiveGroups) {
            let possibleLocs = locations.filter(loc => {
                if (loc.exclusiveOwner && loc.exclusiveOwner !== group.name) return false;
                return loc.allocations.length === 0 || loc.exclusiveOwner === group.name;
            });

            // Try to fit whole group in one location (best fit)
            const affinityLocIds = new Set();
            clients.forEach(c => {
                if (c.affiliate === group.name && c.allocated && c.locationId) affinityLocIds.add(c.locationId);
            });

            possibleLocs.sort((a, b) => {
                const aAff = affinityLocIds.has(a.id) ? 1 : 0;
                const bAff = affinityLocIds.has(b.id) ? 1 : 0;
                if (aAff !== bAff) return bAff - aAff;
                return a.remainingCapacity - b.remainingCapacity;
            });

            let placed = false;
            for (let loc of possibleLocs) {
                if (loc.remainingCapacity >= group.totalDemand) {
                    group.clients.forEach(client => {
                        loc.allocations.push({ clientId: client.id, clientName: client.name, amount: client.batteries, affiliate: client.affiliate });
                        loc.remainingCapacity -= client.batteries;
                        loc.affiliatesHosted.add(client.affiliate);
                        client.allocated = true;
                        client.locationId = loc.id;
                    });
                    loc.exclusiveOwner = group.name;
                    placed = true;
                    break;
                }
            }

            // Split across multiple exclusive locations if needed
            if (!placed) {
                possibleLocs.sort((a, b) => b.remainingCapacity - a.remainingCapacity);
                let remaining = [...group.clients];
                for (let loc of possibleLocs) {
                    if (remaining.length === 0) break;
                    if (loc.remainingCapacity <= 0) continue;
                    const forLater = [];
                    for (let client of remaining) {
                        if (loc.remainingCapacity >= client.batteries) {
                            loc.allocations.push({ clientId: client.id, clientName: client.name, amount: client.batteries, affiliate: client.affiliate });
                            loc.remainingCapacity -= client.batteries;
                            loc.affiliatesHosted.add(client.affiliate);
                            client.allocated = true;
                            client.locationId = loc.id;
                        } else {
                            forLater.push(client);
                        }
                    }
                    if (loc.allocations.length > 0) loc.exclusiveOwner = group.name;
                    remaining = forLater;
                }
            }
        }

        // ============================================================
        // PASS 2: Place remaining clients, minimize affiliate spread
        // ============================================================

        const nonExclusiveGroups = Object.entries(affiliateGroups)
            .filter(([name]) => !exclusiveAffiliateNames.includes(name))
            .map(([name, group]) => ({
                name,
                clients: group.filter(c => !c.allocated),
                totalDemand: group.filter(c => !c.allocated).reduce((sum, c) => sum + c.batteries, 0)
            }))
            .filter(g => g.clients.length > 0)
            .sort((a, b) => b.totalDemand - a.totalDemand); // Largest first

        for (let group of nonExclusiveGroups) {
            let possibleLocs = locations.filter(loc => !loc.exclusiveOwner);

            // Find affinity locations (where this affiliate already has pinned clients)
            const affinityLocIds = new Set();
            clients.forEach(c => {
                if (c.affiliate === group.name && c.allocated && c.locationId) affinityLocIds.add(c.locationId);
            });

            // Sort: affinity first, then best fit (smallest sufficient)
            possibleLocs.sort((a, b) => {
                const aAff = affinityLocIds.has(a.id) ? 1 : 0;
                const bAff = affinityLocIds.has(b.id) ? 1 : 0;
                if (aAff !== bAff) return bAff - aAff;
                return a.remainingCapacity - b.remainingCapacity;
            });

            // Try to fit whole group in one location
            let placed = false;
            for (let loc of possibleLocs) {
                if (loc.remainingCapacity >= group.totalDemand) {
                    group.clients.forEach(client => {
                        loc.allocations.push({ clientId: client.id, clientName: client.name, amount: client.batteries, affiliate: client.affiliate });
                        loc.remainingCapacity -= client.batteries;
                        loc.affiliatesHosted.add(client.affiliate);
                        client.allocated = true;
                        client.locationId = loc.id;
                    });
                    placed = true;
                    break;
                }
            }

            // Must split across locations — fewest possible
            if (!placed) {
                possibleLocs.sort((a, b) => {
                    const aAff = affinityLocIds.has(a.id) ? 1 : 0;
                    const bAff = affinityLocIds.has(b.id) ? 1 : 0;
                    if (aAff !== bAff) return bAff - aAff;
                    return b.remainingCapacity - a.remainingCapacity; // Largest first for fewer splits
                });

                let remaining = [...group.clients].sort((a, b) => b.batteries - a.batteries);
                for (let loc of possibleLocs) {
                    if (remaining.length === 0) break;
                    if (loc.remainingCapacity <= 0) continue;
                    const forLater = [];
                    for (let client of remaining) {
                        if (loc.remainingCapacity >= client.batteries) {
                            loc.allocations.push({ clientId: client.id, clientName: client.name, amount: client.batteries, affiliate: client.affiliate });
                            loc.remainingCapacity -= client.batteries;
                            loc.affiliatesHosted.add(client.affiliate);
                            client.allocated = true;
                            client.locationId = loc.id;
                        } else {
                            forLater.push(client);
                        }
                    }
                    remaining = forLater;
                }
            }
        }

        // ============================================================
        // PASS 3: Overflow — use FULL capacity, prefer affinity locations
        // ============================================================

        const stillUnallocated = clients.filter(c => !c.allocated);
        if (stillUnallocated.length === 0) {
            // All placed! Return results.
            return { locations, clients };
        }

        // Reopen to full capacity
        locations.forEach(loc => {
            const used = loc.allocations.reduce((sum, a) => sum + a.amount, 0);
            loc.remainingCapacity = loc.originalCapacity - used;
        });

        stillUnallocated.sort((a, b) => b.batteries - a.batteries);

        for (let client of stillUnallocated) {
            const isExclusive = exclusiveAffiliateNames.includes(client.affiliate);
            let possibleLocs = locations.filter(loc => {
                if (loc.remainingCapacity < client.batteries) return false;
                if (loc.exclusiveOwner && loc.exclusiveOwner !== client.affiliate) return false;
                if (isExclusive && loc.allocations.length > 0 && loc.exclusiveOwner !== client.affiliate) return false;
                if (!isExclusive && loc.exclusiveOwner) return false;
                return true;
            });

            // Prefer affinity (where affiliate already is), then best fit
            possibleLocs.sort((a, b) => {
                const aHas = a.affiliatesHosted.has(client.affiliate) ? 1 : 0;
                const bHas = b.affiliatesHosted.has(client.affiliate) ? 1 : 0;
                if (aHas !== bHas) return bHas - aHas;
                return a.remainingCapacity - b.remainingCapacity;
            });

            if (possibleLocs.length > 0) {
                const loc = possibleLocs[0];
                loc.allocations.push({ clientId: client.id, clientName: client.name, amount: client.batteries, affiliate: client.affiliate });
                loc.remainingCapacity -= client.batteries;
                loc.affiliatesHosted.add(client.affiliate);
                client.allocated = true;
                client.locationId = loc.id;
                if (isExclusive) loc.exclusiveOwner = client.affiliate;
            }
        }

        // Check if everyone is placed
        const finalUnallocated = clients.filter(c => !c.allocated);
        if (finalUnallocated.length === 0) {
            return { locations, clients };
        }

        // Still have unplaced clients — retry with relaxed capacity
        retryCount++;
        capacityBoost += 0.05; // Bump target up 5% each retry
        console.warn(`Retry ${retryCount}: ${finalUnallocated.length} clients unplaced. Relaxing target by +${(capacityBoost * 100).toFixed(0)}%`);
    }

    // If we exhausted retries, return best effort
    console.warn("Max retries reached. Returning best effort allocation.");
    let clients = JSON.parse(JSON.stringify(inputClients));
    let locations = JSON.parse(JSON.stringify(inputLocations)).map(l => ({
        ...l, allocations: [], originalCapacity: l.capacity, effectiveCapacity: l.capacity,
        remainingCapacity: l.capacity, affiliatesHosted: new Set(), exclusiveOwner: null
    }));
    // One final full-capacity greedy pass
    clients.sort((a, b) => b.batteries - a.batteries);
    for (let client of clients) {
        const loc = locations.filter(l => l.remainingCapacity >= client.batteries).sort((a, b) => a.remainingCapacity - b.remainingCapacity)[0];
        if (loc) {
            loc.allocations.push({ clientId: client.id, clientName: client.name, amount: client.batteries, affiliate: client.affiliate });
            loc.remainingCapacity -= client.batteries;
            loc.affiliatesHosted.add(client.affiliate);
            client.allocated = true;
            client.locationId = loc.id;
        }
    }
    return { locations, clients };
};

export const adjustClientCounts = (clients, target = 18681) => {
    // Similar to previous scaling, but applying to clients.
    // This might cause integer rounding issues.
    const currentSum = clients.reduce((sum, c) => sum + c.batteries, 0);
    const factor = target / currentSum;

    if (factor === 1) return clients;

    let adjusted = clients.map(c => ({
        ...c,
        batteries: Math.round(c.batteries * factor)
    }));

    // Fix rounding error
    const newSum = adjusted.reduce((acc, c) => acc + c.batteries, 0);
    let diff = target - newSum;

    if (diff !== 0) {
        // Add diff to largest client?
        adjusted.sort((a, b) => b.batteries - a.batteries);
        adjusted[0].batteries += diff;
    }

    return adjusted;
};
