import { INITIAL_CLIENTS, INITIAL_LOCATIONS } from './data';

// Calculate affiliate spread score — total unique (affiliate, location) pairs
const getSpreadScore = (locations) => {
    let score = 0;
    locations.forEach(loc => {
        const affiliates = new Set(loc.allocations.map(a => a.affiliate));
        score += affiliates.size;
    });
    return score;
};

// Post-processing: minimize affiliate spread via consolidation + swapping
const optimizeAffiliateSpread = (locations, clients, exclusiveAffiliateNames, pinnedClientNames) => {
    const MAX_ROUNDS = 10;

    for (let round = 0; round < MAX_ROUNDS; round++) {
        const startScore = getSpreadScore(locations);
        let improved = false;

        // ---- PASS A: Consolidation ----
        // For each affiliate across multiple locations, try to move clients
        // from minor locations into locations where the affiliate has more presence
        const affiliateLocMap = {};
        locations.forEach(loc => {
            loc.allocations.forEach(alloc => {
                if (!affiliateLocMap[alloc.affiliate]) affiliateLocMap[alloc.affiliate] = {};
                if (!affiliateLocMap[alloc.affiliate][loc.id]) affiliateLocMap[alloc.affiliate][loc.id] = [];
                affiliateLocMap[alloc.affiliate][loc.id].push(alloc);
            });
        });

        for (const [affName, locMap] of Object.entries(affiliateLocMap)) {
            if (exclusiveAffiliateNames.includes(affName)) continue; // Skip exclusive
            const locIds = Object.keys(locMap);
            if (locIds.length <= 1) continue; // Already consolidated

            // Sort locations by how many batteries this affiliate has there (largest first)
            locIds.sort((a, b) => {
                const aTotal = locMap[a].reduce((s, al) => s + al.amount, 0);
                const bTotal = locMap[b].reduce((s, al) => s + al.amount, 0);
                return bTotal - aTotal;
            });

            // Try to move clients from smaller locations into larger ones
            for (let i = 1; i < locIds.length; i++) {
                const sourceLoc = locations.find(l => l.id === locIds[i]);
                if (!sourceLoc) continue;
                const clientsToMove = locMap[locIds[i]];

                for (const alloc of [...clientsToMove]) {
                    // Skip pinned clients
                    if (pinnedClientNames.has(alloc.clientName)) continue;

                    // Skip if this allocation was already moved in this round
                    if (!sourceLoc.allocations.includes(alloc)) continue;

                    // Try to move to a location where this affiliate already has presence
                    for (let j = 0; j < i; j++) {
                        const targetLoc = locations.find(l => l.id === locIds[j]);
                        if (!targetLoc) continue;
                        if (targetLoc.exclusiveOwners && targetLoc.exclusiveOwners.size > 0 && !targetLoc.exclusiveOwners.has(affName)) continue;
                        // Ensure we don't exceed original capacity
                        if (targetLoc.remainingCapacity >= alloc.amount) {
                            const usedAfterMove = targetLoc.allocations.reduce((s, a) => s + a.amount, 0) + alloc.amount;
                            if (usedAfterMove > targetLoc.originalCapacity) continue;
                            // Move!
                            sourceLoc.allocations = sourceLoc.allocations.filter(a => a !== alloc);
                            sourceLoc.remainingCapacity += alloc.amount;
                            targetLoc.allocations.push(alloc);
                            targetLoc.remainingCapacity -= alloc.amount;
                            targetLoc.affiliatesHosted.add(alloc.affiliate);

                            // Update client record
                            const client = clients.find(c => c.name === alloc.clientName);
                            if (client) client.locationId = targetLoc.id;

                            // Rebuild source affiliatesHosted
                            sourceLoc.affiliatesHosted = new Set(sourceLoc.allocations.map(a => a.affiliate));
                            improved = true;
                            break;
                        }
                    }
                }
            }
        }

        // ---- PASS B: Client Swapping ----
        // Find pairs of clients in different locations where swapping reduces spread
        const locsWithAllocs = locations.filter(l => l.allocations.length > 0);

        for (let li = 0; li < locsWithAllocs.length; li++) {
            for (let lj = li + 1; lj < locsWithAllocs.length; lj++) {
                const locA = locsWithAllocs[li];
                const locB = locsWithAllocs[lj];

                // Skip exclusive locations
                if ((locA.exclusiveOwners && locA.exclusiveOwners.size > 0) || (locB.exclusiveOwners && locB.exclusiveOwners.size > 0)) continue;

                for (let ai = 0; ai < locA.allocations.length; ai++) {
                    const allocA = locA.allocations[ai];
                    if (pinnedClientNames.has(allocA.clientName)) continue;

                    for (let bi = 0; bi < locB.allocations.length; bi++) {
                        const allocB = locB.allocations[bi];
                        if (pinnedClientNames.has(allocB.clientName)) continue;
                        if (allocA.affiliate === allocB.affiliate) continue; // Same affiliate, no benefit

                        // Check if swap is capacity-feasible
                        const deltaA = allocB.amount - allocA.amount; // Net change in locA
                        const deltaB = allocA.amount - allocB.amount; // Net change in locB
                        if (locA.remainingCapacity + allocA.amount - allocB.amount < 0) continue;
                        if (locB.remainingCapacity + allocB.amount - allocA.amount < 0) continue;

                        // Calculate spread score change
                        // Current: count unique affiliates at each location
                        const currentScore = getSpreadScore([locA, locB]);

                        // Simulate swap
                        locA.allocations[ai] = allocB;
                        locB.allocations[bi] = allocA;
                        const newScore = getSpreadScore([locA, locB]);

                        if (newScore < currentScore) {
                            // Swap is beneficial — commit it
                            locA.remainingCapacity += allocA.amount - allocB.amount;
                            locB.remainingCapacity += allocB.amount - allocA.amount;
                            locA.affiliatesHosted = new Set(locA.allocations.map(a => a.affiliate));
                            locB.affiliatesHosted = new Set(locB.allocations.map(a => a.affiliate));

                            const clientA = clients.find(c => c.name === allocA.clientName);
                            const clientB = clients.find(c => c.name === allocB.clientName);
                            if (clientA) clientA.locationId = locB.id;
                            if (clientB) clientB.locationId = locA.id;

                            improved = true;
                        } else {
                            // Revert swap
                            locA.allocations[ai] = allocA;
                            locB.allocations[bi] = allocB;
                        }
                    }
                }
            }
        }

        // ---- PASS C: Full-Affiliate Consolidation ----
        // For affiliates still in multiple locations, try to move ALL their clients
        // into a single location with enough total capacity (even one the affiliate isn't in yet)
        const affiliateLocMap2 = {};
        locations.forEach(loc => {
            loc.allocations.forEach(alloc => {
                if (!affiliateLocMap2[alloc.affiliate]) affiliateLocMap2[alloc.affiliate] = {};
                if (!affiliateLocMap2[alloc.affiliate][loc.id]) affiliateLocMap2[alloc.affiliate][loc.id] = [];
                affiliateLocMap2[alloc.affiliate][loc.id].push(alloc);
            });
        });

        for (const [affName, locMap] of Object.entries(affiliateLocMap2)) {
            if (exclusiveAffiliateNames.includes(affName)) continue;
            const affLocIds = Object.keys(locMap);
            if (affLocIds.length <= 1) continue; // Already in 1 location

            // Calculate total units for this affiliate
            const allAffAllocs = affLocIds.flatMap(lid => locMap[lid]);
            const totalUnits = allAffAllocs.reduce((s, a) => s + a.amount, 0);

            // Check if any of the allocs are pinned — if so, we can only consolidate to the pinned location
            const pinnedAllocs = allAffAllocs.filter(a => pinnedClientNames.has(a.clientName));
            const unpinnedAllocs = allAffAllocs.filter(a => !pinnedClientNames.has(a.clientName));
            if (unpinnedAllocs.length === 0) continue; // All pinned, can't move

            // If there are pinned clients, only try consolidating to pinned locations
            let candidateLocs;
            if (pinnedAllocs.length > 0) {
                const pinnedLocIds = new Set();
                pinnedAllocs.forEach(a => {
                    const loc = locations.find(l => l.allocations.includes(a));
                    if (loc) pinnedLocIds.add(loc.id);
                });
                candidateLocs = locations.filter(l => pinnedLocIds.has(l.id));
            } else {
                // Try all locations (including ones the affiliate isn't in yet)
                candidateLocs = locations.filter(l => {
                    if (l.exclusiveOwners && l.exclusiveOwners.size > 0 && !l.exclusiveOwners.has(affName)) return false;
                    return true;
                });
            }

            // Sort candidates by preference: locations with existing affiliate presence first, then by available capacity
            candidateLocs.sort((a, b) => {
                const aHas = a.affiliatesHosted.has(affName) ? 1 : 0;
                const bHas = b.affiliatesHosted.has(affName) ? 1 : 0;
                if (aHas !== bHas) return bHas - aHas;
                return b.remainingCapacity - a.remainingCapacity;
            });

            for (const targetLoc of candidateLocs) {
                // Calculate how much capacity we'd need: total units minus what's already at this location
                const alreadyAtTarget = locMap[targetLoc.id] ? locMap[targetLoc.id].reduce((s, a) => s + a.amount, 0) : 0;
                const unitsToMove = totalUnits - alreadyAtTarget;
                if (unitsToMove <= 0) continue; // Everything is already here

                // Check capacity
                const currentUsed = targetLoc.allocations.reduce((s, a) => s + a.amount, 0);
                const usedAfterMove = currentUsed + unitsToMove;
                if (usedAfterMove > targetLoc.originalCapacity) continue;

                // Move all unpinned allocations from other locations to this target
                const allocsToMove = unpinnedAllocs.filter(a => {
                    // Only move if this alloc is NOT already at the target
                    const currentLoc = locations.find(l => l.allocations.includes(a));
                    return currentLoc && currentLoc.id !== targetLoc.id;
                });

                if (allocsToMove.length === 0) continue;

                let moveSucceeded = true;
                for (const alloc of allocsToMove) {
                    const sourceLoc = locations.find(l => l.allocations.includes(alloc));
                    if (!sourceLoc) { moveSucceeded = false; break; }

                    sourceLoc.allocations = sourceLoc.allocations.filter(a => a !== alloc);
                    sourceLoc.remainingCapacity += alloc.amount;
                    sourceLoc.affiliatesHosted = new Set(sourceLoc.allocations.map(a => a.affiliate));

                    targetLoc.allocations.push(alloc);
                    targetLoc.remainingCapacity -= alloc.amount;
                    targetLoc.affiliatesHosted.add(alloc.affiliate);

                    const client = clients.find(c => c.name === alloc.clientName);
                    if (client) client.locationId = targetLoc.id;
                }

                if (moveSucceeded) improved = true;
                break; // Successfully consolidated this affiliate
            }
        }

        const endScore = getSpreadScore(locations);
        if (!improved || endScore >= startScore) break; // No improvement, stop
    }

    // Post-processing: Deduplicate any clients that ended up in multiple locations
    // (safety net for consolidation/swapping edge cases)
    const seenClients = new Set();
    locations.forEach(loc => {
        loc.allocations = loc.allocations.filter(alloc => {
            if (seenClients.has(alloc.clientName)) {
                // Duplicate! Remove from this location
                loc.remainingCapacity += alloc.amount;
                return false;
            }
            seenClients.add(alloc.clientName);
            return true;
        });
        loc.affiliatesHosted = new Set(loc.allocations.map(a => a.affiliate));
    });

    return { locations, clients };
};

// Helper: Sort clients based on strategy
const sortClients = (clients, strategy) => {
    const sorted = [...clients];
    switch (strategy) {
        case 'smallest':
            return sorted.sort((a, b) => a.batteries - b.batteries);
        case 'alpha':
            return sorted.sort((a, b) => a.name.localeCompare(b.name));
        case 'round-robin':
            // Group by affiliate, then interleave
            const groups = {};
            sorted.forEach(c => {
                if (!groups[c.affiliate]) groups[c.affiliate] = [];
                groups[c.affiliate].push(c);
            });
            const interleaved = [];
            const affiliateNames = Object.keys(groups);
            let more = true;
            let i = 0;
            while (more) {
                more = false;
                for (const aff of affiliateNames) {
                    if (groups[aff][i]) {
                        interleaved.push(groups[aff][i]);
                        more = true;
                    }
                }
                i++;
            }
            return interleaved;
        case 'affiliate-grouping':
            // Sort by Affiliate Name (A-Z), then by Battery Size (Largest First)
            return sorted.sort((a, b) => {
                const affCompare = a.affiliate.localeCompare(b.affiliate);
                if (affCompare !== 0) return affCompare;
                return b.batteries - a.batteries;
            });
        case 'default':
        default:
            return sorted.sort((a, b) => b.batteries - a.batteries);
    }
};

export const allocateBatteries = (inputClients, inputLocations, exclusiveAffiliateNames = [], pinnedAllocations = [], toleranceMin = 0, toleranceMax = 0, strategy = 'default') => {
    const MAX_RETRIES = 10;
    let retryCount = 0;
    let capacityBoost = 0; // Progressively relax target on retries
    const pinnedClientNames = new Set(pinnedAllocations.map(p => p.clientName));

    // Deduplicate input clients by name to prevent "ghost" duplicates from data sources
    const uniqueClientsMap = new Map();
    const normalizeName = (name) => name ? name.trim() : '';

    inputClients.forEach(c => {
        const normalized = normalizeName(c.name);
        if (!uniqueClientsMap.has(normalized)) {
            // Use the first occurrence as the canonical one
            uniqueClientsMap.set(normalized, { ...c, name: normalized });
        }
    });
    const uniqueInputClients = Array.from(uniqueClientsMap.values());

    let bestResult = null;
    let fewestUnallocated = Infinity;

    while (retryCount <= MAX_RETRIES) {
        // Deep copy fresh state each attempt
        let clients = JSON.parse(JSON.stringify(uniqueInputClients));
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
                exclusiveOwners: new Set() // Changed from string to Set
            };
        });

        // ============================================================
        // PASS 1: Pinned Clients & Exclusive Affiliates
        // ============================================================

        // 1a. Place pinned clients first (they override everything)
        if (pinnedAllocations.length > 0) {
            pinnedAllocations.forEach(pin => {
                const normalizedPinName = normalizeName(pin.clientName);
                // Find index to modify the actual object in the array
                const clientIndex = clients.findIndex(c => c.name === normalizedPinName);
                const client = clients[clientIndex];
                const location = locations.find(l => l.id === pin.locationId);

                // Safety check: Don't allocate if already allocated (prevents duplicate pins issue)
                if (client && location && !client.allocated) {
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
                        location.exclusiveOwners.add(client.affiliate);
                    }
                }
            });
        }

        // 1.5. Place clients with initialLocationId (from import/PDF) 
        // These serve as "soft pins" - respected if capacity allows
        clients.forEach(c => {
            if (c.allocated || !c.initialLocationId) return;

            const loc = locations.find(l => l.id === c.initialLocationId);
            if (!loc) return;

            // Prioritize placement if capacity exists
            if (loc.remainingCapacity >= c.batteries) {
                // Respect existing exclusive owners if any
                if (loc.exclusiveOwners.size > 0 && !loc.exclusiveOwners.has(c.affiliate)) return;

                loc.allocations.push({
                    clientId: c.id,
                    clientName: c.name,
                    amount: c.batteries,
                    affiliate: c.affiliate
                });
                loc.remainingCapacity -= c.batteries;
                loc.affiliatesHosted.add(c.affiliate);
                c.allocated = true;
                c.locationId = loc.id;

                if (exclusiveAffiliateNames.includes(c.affiliate)) {
                    loc.exclusiveOwners.add(c.affiliate);
                }
            }
        });

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
                // Sort clients within exclusive groups based on strategy
                clients: sortClients(group, strategy),
                totalDemand: group.reduce((sum, c) => sum + c.batteries, 0)
            }))
            .sort((a, b) => a.totalDemand - b.totalDemand); // Smallest total demand first for better packing

        for (let group of exclusiveGroups) {
            let possibleLocs = locations.filter(loc => {
                // If it has owners, we must be one of them
                if (loc.exclusiveOwners.size > 0 && !loc.exclusiveOwners.has(group.name)) return false;
                // If empty or already owned by us, it's a candidate
                return loc.allocations.length === 0 || loc.exclusiveOwners.has(group.name);
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
                    loc.exclusiveOwners.add(group.name);
                    placed = true;
                    break;
                }
            }

            // Split across multiple exclusive locations if needed
            if (!placed) {
                // Prioritize affinity locations, then largest capacity
                possibleLocs.sort((a, b) => {
                    const aAff = affinityLocIds.has(a.id) ? 1 : 0;
                    const bAff = affinityLocIds.has(b.id) ? 1 : 0;
                    if (aAff !== bAff) return bAff - aAff;
                    return b.remainingCapacity - a.remainingCapacity;
                });

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
                    if (loc.allocations.length > 0) loc.exclusiveOwners.add(group.name);
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
                clients: sortClients(group.filter(c => !c.allocated), strategy),
                totalDemand: group.filter(c => !c.allocated).reduce((sum, c) => sum + c.batteries, 0)
            }))
            .filter(g => g.clients.length > 0)
            .sort((a, b) => b.totalDemand - a.totalDemand); // Largest total demand first

        for (let group of nonExclusiveGroups) {
            // Can only use locations that have NO exclusive owners
            let possibleLocs = locations.filter(loc => loc.exclusiveOwners.size === 0);

            // Find affinity locations (where this affiliate already has pinned clients)
            const affinityLocIds = new Set();
            clients.forEach(c => {
                if (c.affiliate === group.name && c.allocated && c.locationId) affinityLocIds.add(c.locationId);
            });

            // Sort: affinity first, then best fit (smallest sufficient)
            // Sort: best fit, or affinity if 'affiliate-grouping'
            possibleLocs.sort((a, b) => {
                // Only consider affinity if specifically grouping by affiliate
                if (strategy === 'affiliate-grouping') {
                    const aAff = affinityLocIds.has(a.id) ? 1 : 0;
                    const bAff = affinityLocIds.has(b.id) ? 1 : 0;
                    if (aAff !== bAff) return bAff - aAff;
                }
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
                    if (strategy === 'affiliate-grouping') {
                        const aAff = affinityLocIds.has(a.id) ? 1 : 0;
                        const bAff = affinityLocIds.has(b.id) ? 1 : 0;
                        if (aAff !== bAff) return bAff - aAff;
                    }
                    return b.remainingCapacity - a.remainingCapacity; // Largest first for fewer splits
                });

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
                    remaining = forLater;
                }
            }
        }

        // ============================================================
        // PASS 3: Overflow — use FULL capacity, prefer affinity locations
        // ============================================================

        const stillUnallocated = clients.filter(c => !c.allocated);
        if (stillUnallocated.length === 0) {
            // All placed! Optimize and return.
            return optimizeAffiliateSpread(locations, clients, exclusiveAffiliateNames, pinnedClientNames);
        }

        // Reopen to full capacity
        locations.forEach(loc => {
            const used = loc.allocations.reduce((sum, a) => sum + a.amount, 0);
            loc.remainingCapacity = loc.originalCapacity - used;
        });

        // Sort unallocated according to strategy for final pass
        const sortedUnallocated = sortClients(stillUnallocated, strategy);

        for (let client of sortedUnallocated) {
            const isExclusive = exclusiveAffiliateNames.includes(client.affiliate);
            let possibleLocs = locations.filter(loc => {
                if (loc.remainingCapacity < client.batteries) return false;

                // Exclusivity checks
                if (loc.exclusiveOwners.size > 0) {
                    // Location is exclusive -> only owners can play
                    return loc.exclusiveOwners.has(client.affiliate);
                } else if (isExclusive) {
                    return loc.allocations.length === 0;
                }

                return true;
            });

            // Strategy-based location sorting
            possibleLocs.sort((a, b) => {
                // Only prioritize affinity (where affiliate already is) for 'affiliate-grouping'
                if (strategy === 'affiliate-grouping') {
                    const aHas = a.affiliatesHosted.has(client.affiliate) ? 1 : 0;
                    const bHas = b.affiliatesHosted.has(client.affiliate) ? 1 : 0;
                    if (aHas !== bHas) return bHas - aHas;
                }

                // Strategy-based location sorting
                if (strategy === 'default') {
                    // Largest First: Prioritize locations with MORE remaining capacity (fill big buckets)
                    return b.remainingCapacity - a.remainingCapacity;
                } else if (strategy === 'smallest') {
                    // Smallest First: Prioritize locations with LESS remaining capacity (fill small buckets / best fit)
                    return a.remainingCapacity - b.remainingCapacity;
                } else {
                    // Others (Alpha, Round Robin, Affiliate Grouping): Default to Best Fit (efficient packing)
                    return a.remainingCapacity - b.remainingCapacity;
                }
            });

            if (possibleLocs.length > 0) {
                const loc = possibleLocs[0];
                loc.allocations.push({ clientId: client.id, clientName: client.name, amount: client.batteries, affiliate: client.affiliate });
                loc.remainingCapacity -= client.batteries;
                loc.affiliatesHosted.add(client.affiliate);
                client.allocated = true;
                client.locationId = loc.id;
                if (isExclusive) loc.exclusiveOwners.add(client.affiliate);
            }
        }

        // Check if everyone is placed
        const finalUnallocated = clients.filter(c => !c.allocated);

        // Track best result (fewest unallocated)
        if (finalUnallocated.length < fewestUnallocated) {
            fewestUnallocated = finalUnallocated.length;
            bestResult = { locations, clients };
        }

        if (finalUnallocated.length === 0) {
            return optimizeAffiliateSpread(locations, clients, exclusiveAffiliateNames, pinnedClientNames);
        }

        // Still have unplaced clients — retry with relaxed capacity
        retryCount++;
        capacityBoost += 0.05; // Bump target up 5% each retry
        console.warn(`Retry ${retryCount}: ${finalUnallocated.length} clients unplaced. Relaxing target by +${(capacityBoost * 100).toFixed(0)}%`);
    }

    // If we exhausted retries, return the BEST result that still respects pins & exclusivity.
    // Some clients may remain unallocated — that's better than violating constraints.
    console.warn(`Max retries reached. Returning best-effort allocation (${fewestUnallocated} clients unallocated).`);
    if (bestResult) {
        return optimizeAffiliateSpread(bestResult.locations, bestResult.clients, exclusiveAffiliateNames, pinnedClientNames);
    }
    // Should never reach here, but just in case
    return { locations: [], clients: [] };
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
