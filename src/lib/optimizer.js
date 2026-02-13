import { INITIAL_CLIENTS, INITIAL_LOCATIONS } from './data';

export const allocateBatteries = (inputClients, inputLocations, exclusiveAffiliateNames = [], pinnedAllocations = [], toleranceMin = 0, toleranceMax = 0) => {
    // Deep copy
    let clients = JSON.parse(JSON.stringify(inputClients));
    // Calculate effective limit factor
    const limitFactor = (100 - toleranceMin) / 100;

    let locations = JSON.parse(JSON.stringify(inputLocations)).map(l => {
        const effectiveCapacity = Math.floor(l.capacity * limitFactor);
        return {
            ...l,
            allocations: [], // Will now store { clientName, amount, affiliate }
            originalCapacity: l.capacity, // Keep track of real physical cap
            effectiveCapacity: effectiveCapacity, // The cap we are targeting
            remainingCapacity: effectiveCapacity, // Start with the reduced cap
            affiliatesHosted: new Set(), // Track which affiliates are here
            exclusiveOwner: null // Track if this location is locked by an exclusive affiliate
        };
    });

    // 0. Pre-process Pinned Clients
    // Format of pinnedAllocations: [{ clientName: String, locationId: String }]
    if (pinnedAllocations.length > 0) {
        pinnedAllocations.forEach(pin => {
            const client = clients.find(c => c.name === pin.clientName);
            const location = locations.find(l => l.id === pin.locationId);

            if (client && location) {
                // If location is exclusive to someone else, we might have a conflict.
                // But "Pinning" usually overrides logic.
                // We will just allocate it.

                // Add to location
                location.allocations.push({
                    clientId: client.id,
                    clientName: client.name,
                    amount: client.batteries,
                    affiliate: client.affiliate
                });
                location.remainingCapacity -= client.batteries;
                location.affiliatesHosted.add(client.affiliate);

                // Mark client as allocated
                client.allocated = true;
                client.locationId = location.id;

                // Handle Exclusive Logic Interaction??
                // If this client belongs to an Exclusive Affiliate, should we mark the location?
                // Probably yes, to prevent others from jumping in if the user intends this.
                if (exclusiveAffiliateNames.includes(client.affiliate)) {
                    location.exclusiveOwner = client.affiliate;
                }
            }
        });
    }

    // 1. Group Clients by Affiliate
    const affiliateGroups = {};
    clients.forEach(c => {
        // Skip already pinned/allocated clients from the group logic
        // Wait, if we remove them from the group, the `totalDemand` of the group drops.
        // This is correct because the "remaining" demand is what needs to be allocated.
        if (c.allocated) return;

        if (!affiliateGroups[c.affiliate]) affiliateGroups[c.affiliate] = [];
        affiliateGroups[c.affiliate].push(c);
    });

    // 2. Sort Affiliate Groups by Total Size (Largest First) - "Large affiliates get large locations"
    const sortedAffiliates = Object.entries(affiliateGroups)
        .map(([name, group]) => ({
            name,
            clients: group,
            totalDemand: group.reduce((sum, c) => sum + c.batteries, 0)
        }))

        .sort((a, b) => {
            // Priority 1: Exclusive Affiliates First
            const aEx = exclusiveAffiliateNames.includes(a.name);
            const bEx = exclusiveAffiliateNames.includes(b.name);

            if (aEx && !bEx) return -1;
            if (!aEx && bEx) return 1;

            // Priority 2: Within Exclusive, Sort Smallest -> Largest (Better packing for rigid exclusive blocks)
            if (aEx && bEx) {
                return a.totalDemand - b.totalDemand;
            }

            // Priority 3: Non-Exclusive, Sort Largest -> Smallest (Fill big rocks first)
            return b.totalDemand - a.totalDemand;
        });

    // 3. Sort Locations by Capacity (Largest First)
    locations.sort((a, b) => b.capacity - a.capacity);

    // 4. Allocation Logic
    for (let group of sortedAffiliates) {
        const isExclusive = exclusiveAffiliateNames.includes(group.name);

        // Filter valid locations for this group
        // If Exclusive: Must be empty OR already owned by this group
        // If Non-Exclusive: Must NOT be owned by any exclusive group (and preferably not be target for exclusive, but we prioritize exclusive so valid locs are just non-exclusive ones)

        let possibleLocations = locations.filter(loc => {
            if (loc.exclusiveOwner && loc.exclusiveOwner !== group.name) return false; // Locked by someone else

            if (isExclusive) {
                // Must be Empty OR Owned by Self
                return loc.allocations.length === 0 || loc.exclusiveOwner === group.name;
            } else {
                // Non-Exclusive: Can go anywhere that is NOT locked
                return !loc.exclusiveOwner;
            }
        });

        // Identify Affinity Locations (where this affiliate already has pinned/allocated clients)
        const affinityLocIds = new Set();
        clients.forEach(c => {
            if (c.affiliate === group.name && c.allocated && c.locationId) {
                affinityLocIds.add(c.locationId);
            }
        });

        // Strategy A: Try to fit WHOLE group into ONE location
        // OPTIMIZATION: Use "Best Fit" (Smallest Sufficient Location), BUT prioritize Affinity Locations

        // Sort: Affinity First, then Best Fit (Smallest Sufficient -> Largest)
        possibleLocations.sort((a, b) => {
            const aAffinity = affinityLocIds.has(a.id);
            const bAffinity = affinityLocIds.has(b.id);

            if (aAffinity && !bAffinity) return -1; // Prioritize Affinity
            if (!aAffinity && bAffinity) return 1;

            // Standard Best Fit
            return a.remainingCapacity - b.remainingCapacity;
        });

        let allocated = false;

        for (let loc of possibleLocations) {
            if (loc.remainingCapacity >= group.totalDemand) {
                // Fits!
                group.clients.forEach(client => {
                    loc.allocations.push({
                        clientId: client.id,
                        clientName: client.name,
                        amount: client.batteries,
                        affiliate: client.affiliate
                    });
                    loc.remainingCapacity -= client.batteries;
                    loc.affiliatesHosted.add(client.affiliate);
                    client.locationId = loc.id;
                    client.allocated = true;
                });

                if (isExclusive) {
                    loc.exclusiveOwner = group.name;
                }

                allocated = true;
                break;
            }
        }

        // Strategy B: If it doesn't fit in one, we MUST split.
        // Fill the largest available locations first until done (Worst Fit / Greedy).
        if (!allocated) {
            // Re-sort Descending (Largest -> Smallest) for Chunking
            possibleLocations.sort((a, b) => b.remainingCapacity - a.remainingCapacity);

            let clientsToAlloc = [...group.clients];
            // Sort clients large to small? Or doesn't matter much.

            for (let loc of possibleLocations) {
                if (clientsToAlloc.length === 0) break;
                if (loc.remainingCapacity <= 0) continue;

                // Pack as many clients as possible into this location
                // Greedy packing: take clients that fit.
                // Or just fill sequentially?
                // Let's just fill sequentially.
                // Note: We are allocating CLIENTS, not dividing batteries.
                // So if a client has size 100 and loc has 50 space, we SKIP this client for this loc?
                // Or do we split the client? Requirement: "Don't split clients across multiple locations"
                // So we MUST find a location for the whole client.

                const clientsForThisLoc = [];
                const clientsForLater = [];

                for (let client of clientsToAlloc) {
                    if (loc.remainingCapacity >= client.batteries) {
                        // Add client
                        loc.allocations.push({
                            clientId: client.id,
                            clientName: client.name,
                            amount: client.batteries,
                            affiliate: client.affiliate
                        });
                        loc.remainingCapacity -= client.batteries;
                        loc.affiliatesHosted.add(client.affiliate);
                        client.allocated = true;
                        client.locationId = loc.id;
                    } else {
                        clientsForLater.push(client);
                    }
                }

                if (loc.allocations.length > 0 && isExclusive) {
                    loc.exclusiveOwner = group.name;
                }

                clientsToAlloc = clientsForLater;
            }

            if (clientsToAlloc.length > 0) {
                console.warn("Could not allocate some clients for", group.name, clientsToAlloc);
            }
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
