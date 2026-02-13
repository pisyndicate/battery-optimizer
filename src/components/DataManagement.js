import React, { useState } from 'react';

const DataManagement = ({ onDataUpload, onReset }) => {
    const [error, setError] = useState('');

    const parseCSV = (text) => {
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) return [];

        const parseLine = (line) => {
            const result = [];
            let current = '';
            let inQuotes = false;

            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    result.push(current.trim().replace(/^"|"$/g, ''));
                    current = '';
                } else {
                    current += char;
                }
            }
            result.push(current.trim().replace(/^"|"$/g, ''));
            return result;
        };

        const headers = parseLine(lines[0]).map(h => h.toLowerCase());
        const data = [];

        for (let i = 1; i < lines.length; i++) {
            const currentLine = parseLine(lines[i]);
            if (currentLine.length < headers.length) continue;

            const entry = {};
            headers.forEach((h, index) => {
                entry[h] = currentLine[index];
            });
            data.push(entry);
        }
        return data;
    };

    const handleFileUpload = (e, type) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const text = event.target.result;
                const parsed = parseCSV(text);

                if (type === 'locations') {
                    const validLocations = parsed.map(l => ({
                        id: l.id,
                        name: l.name,
                        capacity: parseInt(l.capacity, 10)
                    })).filter(l => l.id && l.name && !isNaN(l.capacity));

                    if (validLocations.length === 0) throw new Error("No valid locations. CSV needs: id, name, capacity");
                    onDataUpload({ locations: validLocations });
                } else if (type === 'clients') {
                    const validClients = parsed.map((c, idx) => ({
                        id: c.id || `c_up_${idx}`,
                        name: c.name,
                        batteries: parseInt(c.batteries || c.units, 10),
                        affiliate: c.affiliate
                    })).filter(c => c.name && !isNaN(c.batteries) && c.affiliate);

                    if (validClients.length === 0) throw new Error("No valid clients. CSV needs: name, batteries, affiliate");
                    onDataUpload({ clients: validClients });
                }
                setError('');
            } catch (err) {
                setError(err.message);
            }
        };
        reader.readAsText(file);
    };

    const handleManifestUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Helper to parse numbers with commas and whitespace like "  2,056 "
        const parseNum = (val) => {
            if (!val) return NaN;
            return parseInt(String(val).replace(/[,\s]/g, ''), 10);
        };

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const text = event.target.result;
                const parsed = parseCSV(text);

                if (parsed.length === 0) throw new Error("No data found in CSV");

                // Extract unique locations from manifest
                const locationMap = new Map();
                parsed.forEach(row => {
                    const locName = row['location name'] || row['location'];
                    const locCap = parseNum(row['location capacity'] || row['capacity']);
                    const locId = row['id'] || `LOC_${(locName || '').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}`;
                    if (locName && !isNaN(locCap) && !locationMap.has(locName)) {
                        locationMap.set(locName, {
                            id: locId,
                            name: locName,
                            capacity: locCap
                        });
                    }
                });

                // Extract clients from manifest
                const clientMap = new Map();
                parsed.forEach((row, idx) => {
                    const clientName = row['client name'] || row['client'] || row['name'];
                    const batteries = parseNum(row['batteries'] || row['units']);
                    const affiliate = row['affiliate'];
                    if (clientName && !isNaN(batteries) && affiliate) {
                        // Aggregate batteries per client (same client may appear in multiple locations)
                        if (clientMap.has(clientName)) {
                            clientMap.get(clientName).batteries += batteries;
                        } else {
                            clientMap.set(clientName, {
                                id: `c_manifest_${idx}`,
                                name: clientName,
                                batteries,
                                affiliate
                            });
                        }
                    }
                });

                const locations = Array.from(locationMap.values());
                const clients = Array.from(clientMap.values());

                if (locations.length === 0) throw new Error("No valid locations found. Expected columns: Location Name, Location Capacity");
                if (clients.length === 0) throw new Error("No valid clients found. Expected columns: Client Name, Affiliate, Batteries");

                onDataUpload({ locations, clients });
                setError('');
            } catch (err) {
                setError(err.message);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const buttonStyle = {
        width: '100%',
        padding: '8px 12px',
        backgroundColor: '#0f172a',
        color: '#e2e8f0',
        border: '1px solid #334155',
        borderRadius: '6px',
        cursor: 'pointer',
        fontSize: '0.8rem',
        fontWeight: '500',
        textAlign: 'center',
        transition: 'all 0.15s ease'
    };

    return (
        <div>
            {/* Import Manifest */}
            <div style={{ marginBottom: '12px' }}>
                <label
                    htmlFor="upload-manifest"
                    style={{
                        ...buttonStyle,
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        color: '#60a5fa',
                        border: '1px solid rgba(59, 130, 246, 0.25)',
                        display: 'block'
                    }}
                    role="button"
                    tabIndex={0}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.1)'; }}
                >
                    📋 Import Completed Manifest
                </label>
                <input
                    id="upload-manifest"
                    type="file"
                    accept=".csv"
                    onChange={handleManifestUpload}
                    style={{ display: 'none' }}
                    aria-label="Upload completed manifest CSV file"
                />
            </div>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '12px 0' }}>
                <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.1)' }}></div>
                <span style={{ fontSize: '0.65rem', color: '#64748b', textTransform: 'uppercase' }}>or upload separately</span>
                <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.1)' }}></div>
            </div>

            {/* Instructions */}
            <div style={{ marginBottom: '12px', padding: '10px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8', lineHeight: '1.5' }}>
                    Upload CSV files with headers:<br />
                    <span style={{ color: '#cbd5e1' }}>Locations:</span> <code style={{ color: '#93c5fd', fontSize: '0.7rem' }}>id, name, capacity</code><br />
                    <span style={{ color: '#cbd5e1' }}>Clients:</span> <code style={{ color: '#93c5fd', fontSize: '0.7rem' }}>name, batteries, affiliate</code>
                </p>
            </div>

            {/* Upload Buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                <div>
                    <label
                        htmlFor="upload-locations"
                        style={buttonStyle}
                        role="button"
                        tabIndex={0}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#1e293b'; e.currentTarget.style.borderColor = '#475569'; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#0f172a'; e.currentTarget.style.borderColor = '#334155'; }}
                    >
                        📍 Locations
                    </label>
                    <input
                        id="upload-locations"
                        type="file"
                        accept=".csv"
                        onChange={(e) => handleFileUpload(e, 'locations')}
                        style={{ display: 'none' }}
                        aria-label="Upload locations CSV file"
                    />
                </div>
                <div>
                    <label
                        htmlFor="upload-clients"
                        style={buttonStyle}
                        role="button"
                        tabIndex={0}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#1e293b'; e.currentTarget.style.borderColor = '#475569'; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#0f172a'; e.currentTarget.style.borderColor = '#334155'; }}
                    >
                        👤 Clients
                    </label>
                    <input
                        id="upload-clients"
                        type="file"
                        accept=".csv"
                        onChange={(e) => handleFileUpload(e, 'clients')}
                        style={{ display: 'none' }}
                        aria-label="Upload clients CSV file"
                    />
                </div>
            </div>

            {/* Reset */}
            <button
                onClick={onReset}
                style={{
                    ...buttonStyle,
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    color: '#f87171',
                    border: '1px solid rgba(239, 68, 68, 0.2)'
                }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)'; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)'; }}
            >
                Reset to Default Data
            </button>

            {error && (
                <div style={{ marginTop: '8px', color: '#f87171', fontSize: '0.75rem', padding: '8px', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '4px' }}>
                    ⚠ {error}
                </div>
            )}
        </div>
    );
};

export default DataManagement;
