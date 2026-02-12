import React, { useState } from 'react';
// Since I can't easily add packages without approval/risk, I'll write a simple parser.
// Actually, `npm install papaparse` is safe usually, but I'll write a robust enough native parser for simplicity.

const DataManagement = ({ onDataUpload, onReset }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [error, setError] = useState('');

    const parseCSV = (text) => {
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) return []; // Header + 1 row

        const parseLine = (line) => {
            const result = [];
            let current = '';
            let inQuotes = false;

            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    result.push(current.trim().replace(/^"|"$/g, '')); // Remove surrounding quotes
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
                    // Validate Location Data
                    const validLocations = parsed.map(l => ({
                        id: l.id,
                        name: l.name,
                        capacity: parseInt(l.capacity, 10)
                    })).filter(l => l.id && l.name && !isNaN(l.capacity));

                    if (validLocations.length === 0) throw new Error("No valid locations found. CSV must have id, name, capacity.");

                    onDataUpload({ locations: validLocations });
                } else if (type === 'clients') {
                    // Validate Client Data
                    const validClients = parsed.map((c, idx) => ({
                        id: c.id || `c_up_${idx}`,
                        name: c.name,
                        batteries: parseInt(c.batteries || c.units, 10), // Support 'batteries' or 'units'
                        affiliate: c.affiliate
                    })).filter(c => c.name && !isNaN(c.batteries) && c.affiliate);

                    if (validClients.length === 0) throw new Error("No valid clients found. CSV must have name, batteries (or units), affiliate.");

                    onDataUpload({ clients: validClients });
                }
                setError('');
            } catch (err) {
                setError(err.message);
            }
        };
        reader.readAsText(file);
    };

    return (
        <div style={{ marginBottom: '24px', padding: '16px', backgroundColor: '#e2e3e5', borderRadius: '8px' }}>
            <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => setIsOpen(!isOpen)}
            >
                <h3 style={{ margin: 0 }}>📂 Data Management (Upload CSVs)</h3>
                <span>{isOpen ? '▲' : '▼'}</span>
            </div>

            {isOpen && (
                <div style={{ marginTop: '16px' }}>
                    <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#fff', borderRadius: '4px' }}>
                        <p style={{ margin: '0 0 8px 0', fontSize: '0.9em' }}>
                            <strong>Instructions:</strong> Upload CSV files with headers.
                            <br />Locations: <code>id, name, capacity</code>
                            <br />Clients: <code>name, batteries, affiliate</code>
                        </p>
                        <button onClick={onReset} style={{ padding: '4px 8px', fontSize: '0.8em', backgroundColor: '#6c757d', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                            Reset to Default Data
                        </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Upload Locations.csv</label>
                            <input
                                type="file"
                                accept=".csv"
                                onChange={(e) => handleFileUpload(e, 'locations')}
                                style={{ display: 'block', width: '100%' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Upload Clients.csv</label>
                            <input
                                type="file"
                                accept=".csv"
                                onChange={(e) => handleFileUpload(e, 'clients')}
                                style={{ display: 'block', width: '100%' }}
                            />
                        </div>
                    </div>

                    {error && (
                        <div style={{ marginTop: '12px', color: '#dc3545', fontWeight: 'bold' }}>
                            Error: {error}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default DataManagement;
