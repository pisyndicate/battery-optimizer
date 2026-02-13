import React, { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';

// ─── PDF helper (lazy-loaded) ────────────────────────────
let pdfjsLib = null;
async function loadPdfJs() {
    if (pdfjsLib) return pdfjsLib;
    pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    return pdfjsLib;
}

// ─── Format Parsers ──────────────────────────────────────

function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];

    const parseLine = (line) => {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') inQuotes = !inQuotes;
            else if ((ch === ',' || ch === '\t') && !inQuotes) {
                result.push(current.trim().replace(/^"|"$/g, ''));
                current = '';
            } else {
                current += ch;
            }
        }
        result.push(current.trim().replace(/^"|"$/g, ''));
        return result;
    };

    const headers = parseLine(lines[0]).map(h => h.toLowerCase().trim());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const vals = parseLine(lines[i]);
        if (vals.length < headers.length) continue;
        const entry = {};
        headers.forEach((h, idx) => { entry[h] = vals[idx]; });
        rows.push(entry);
    }
    return { headers, rows };
}

function parseExcel(buffer) {
    const wb = XLSX.read(buffer, { type: 'array' });
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (jsonData.length === 0) return { headers: [], rows: [] };

    const headers = Object.keys(jsonData[0]).map(h => h.toLowerCase().trim());
    const rows = jsonData.map(row => {
        const entry = {};
        Object.entries(row).forEach(([k, v]) => {
            entry[k.toLowerCase().trim()] = String(v);
        });
        return entry;
    });
    return { headers, rows };
}

async function parsePDF(buffer) {
    const pdfjs = await loadPdfJs();
    const pdf = await pdfjs.getDocument({ data: buffer }).promise;
    let allText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();

        // Group text items by Y position to reconstruct rows
        const lineMap = new Map();
        content.items.forEach(item => {
            const y = Math.round(item.transform[5]); // Y position
            if (!lineMap.has(y)) lineMap.set(y, []);
            lineMap.get(y).push({ x: item.transform[4], text: item.str });
        });

        // Sort lines top-to-bottom (higher Y = higher on page)
        const sortedYs = Array.from(lineMap.keys()).sort((a, b) => b - a);
        sortedYs.forEach(y => {
            const items = lineMap.get(y).sort((a, b) => a.x - b.x);
            // Use tab separation between items that have significant gaps
            let line = '';
            let lastX = -1;
            items.forEach(item => {
                if (lastX >= 0 && item.x - lastX > 15) {
                    line += '\t';
                }
                line += item.text;
                lastX = item.x + (item.text.length * 5); // approximate
            });
            allText += line + '\n';
        });
    }

    // Try to parse the extracted text as tabular data
    return parseCSV(allText);
}

function parseJSON(text) {
    const data = JSON.parse(text);

    // Handle different JSON structures
    if (Array.isArray(data) && data.length > 0) {
        const headers = Object.keys(data[0]).map(h => h.toLowerCase().trim());
        const rows = data.map(item => {
            const entry = {};
            Object.entries(item).forEach(([k, v]) => {
                entry[k.toLowerCase().trim()] = String(v);
            });
            return entry;
        });
        return { headers, rows };
    }

    // { locations: [...], clients: [...] }
    if (data.locations || data.clients) {
        return { headers: [], rows: [], structured: data };
    }

    throw new Error('Unrecognized JSON structure');
}

// ─── Data Type Detection ─────────────────────────────────

function detectDataType(headers, rows, structured) {
    if (structured) {
        return 'manifest';
    }

    const h = new Set(headers);
    const hasCapacity = h.has('capacity') || h.has('location capacity');
    const hasBatteries = h.has('batteries') || h.has('units');
    const hasAffiliate = h.has('affiliate');
    const hasLocationName = h.has('location name') || h.has('location');
    const hasClientName = h.has('client name') || h.has('client');

    // Combined manifest
    if ((hasCapacity || hasLocationName) && (hasBatteries || hasAffiliate) && (hasClientName)) {
        return 'manifest';
    }
    // Clients
    if ((hasBatteries || hasAffiliate) && h.has('name')) {
        return 'clients';
    }
    // Locations
    if (hasCapacity && (h.has('name') || h.has('id'))) {
        return 'locations';
    }
    // Manifest if has both location and client columns
    if (hasLocationName && hasClientName) {
        return 'manifest';
    }

    return 'unknown';
}

function parseNum(val) {
    if (!val) return NaN;
    return parseInt(String(val).replace(/[,\s$]/g, ''), 10);
}

function extractData(type, headers, rows, structured) {
    if (type === 'manifest' && structured) {
        // Direct JSON manifest
        const result = {};
        if (structured.locations) {
            result.locations = structured.locations.map(l => ({
                id: l.id,
                name: l.name,
                capacity: parseInt(l.capacity, 10)
            })).filter(l => l.id && l.name && !isNaN(l.capacity));
        }
        if (structured.clients) {
            result.clients = structured.clients.map((c, idx) => ({
                id: c.id || `c_json_${idx}`,
                name: c.name,
                batteries: parseInt(c.batteries || c.units, 10),
                affiliate: c.affiliate
            })).filter(c => c.name && !isNaN(c.batteries) && c.affiliate);
        }
        return result;
    }

    if (type === 'manifest') {
        const locationMap = new Map();
        const clientMap = new Map();

        rows.forEach((row, idx) => {
            const locName = row['location name'] || row['location'];
            const locCap = parseNum(row['location capacity'] || row['capacity']);
            const locId = row['id'] || `LOC_${(locName || '').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}`;
            if (locName && !isNaN(locCap) && !locationMap.has(locName)) {
                locationMap.set(locName, { id: locId, name: locName, capacity: locCap });
            }

            const clientName = row['client name'] || row['client'] || row['name'];
            const batteries = parseNum(row['batteries'] || row['units']);
            const affiliate = row['affiliate'];
            if (clientName && !isNaN(batteries) && affiliate) {
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

        return {
            locations: Array.from(locationMap.values()),
            clients: Array.from(clientMap.values())
        };
    }

    if (type === 'locations') {
        const locations = rows.map(l => ({
            id: l.id || `LOC_${(l.name || '').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}`,
            name: l.name,
            capacity: parseNum(l.capacity)
        })).filter(l => l.name && !isNaN(l.capacity));
        return { locations };
    }

    if (type === 'clients') {
        const clients = rows.map((c, idx) => ({
            id: c.id || `c_up_${idx}`,
            name: c.name,
            batteries: parseNum(c.batteries || c.units),
            affiliate: c.affiliate
        })).filter(c => c.name && !isNaN(c.batteries) && c.affiliate);
        return { clients };
    }

    throw new Error('Could not determine data type');
}


// ═══════════════════════════════════════════════════════════
//  COMPONENT
// ═══════════════════════════════════════════════════════════
const DataManagement = ({ onDataUpload, onReset }) => {
    const [error, setError] = useState('');
    const [preview, setPreview] = useState(null); // { fileName, format, type, headers, rows, data, structured }
    const [loading, setLoading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [showPaste, setShowPaste] = useState(false);
    const [pasteText, setPasteText] = useState('');
    const fileInputRef = useRef(null);

    // ── File processing pipeline ──────────────────────
    const processFile = useCallback(async (file) => {
        setError('');
        setLoading(true);
        setPreview(null);

        try {
            const ext = file.name.split('.').pop().toLowerCase();
            let headers, rows, structured = null;

            if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
                const text = await file.text();
                ({ headers, rows } = parseCSV(text));
            } else if (ext === 'xlsx' || ext === 'xls') {
                const buffer = await file.arrayBuffer();
                ({ headers, rows } = parseExcel(buffer));
            } else if (ext === 'pdf') {
                const buffer = await file.arrayBuffer();
                ({ headers, rows } = await parsePDF(buffer));
            } else if (ext === 'json') {
                const text = await file.text();
                const result = parseJSON(text);
                headers = result.headers;
                rows = result.rows;
                structured = result.structured || null;
            } else {
                throw new Error(`Unsupported format: .${ext}`);
            }

            if (rows.length === 0 && !structured) {
                throw new Error('No data rows found in the file');
            }

            const type = detectDataType(headers, rows, structured);
            const data = extractData(type, headers, rows, structured);

            setPreview({
                fileName: file.name,
                format: ext.toUpperCase(),
                type,
                headers,
                rows,
                data,
                structured
            });
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    // ── Paste handler ─────────────────────────────────
    const handlePaste = useCallback(() => {
        if (!pasteText.trim()) return;
        setError('');
        setLoading(true);

        try {
            const { headers, rows } = parseCSV(pasteText);
            if (rows.length === 0) throw new Error('No data rows found in pasted text');

            const type = detectDataType(headers, rows, null);
            const data = extractData(type, headers, rows, null);

            setPreview({
                fileName: 'Pasted Data',
                format: 'TEXT',
                type,
                headers,
                rows,
                data,
                structured: null
            });
            setShowPaste(false);
            setPasteText('');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [pasteText]);

    // ── Import confirmed ──────────────────────────────
    const handleImport = useCallback(() => {
        if (!preview?.data) return;
        onDataUpload(preview.data);
        setPreview(null);
        setError('');
    }, [preview, onDataUpload]);

    // ── Drag & Drop ───────────────────────────────────
    const onDragOver = (e) => { e.preventDefault(); setDragOver(true); };
    const onDragLeave = () => setDragOver(false);
    const onDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) processFile(file);
    };

    // ── Helper counts ─────────────────────────────────
    const dataStats = preview?.data ? {
        locations: preview.data.locations?.length || 0,
        clients: preview.data.clients?.length || 0,
    } : null;

    const typeLabels = {
        manifest: '📋 Combined Manifest',
        locations: '📍 Locations',
        clients: '👤 Clients',
        unknown: '❓ Unknown'
    };

    const formatIcons = {
        CSV: '📄', TSV: '📄', TXT: '📄',
        XLSX: '📊', XLS: '📊',
        PDF: '📕',
        JSON: '🔧',
        TEXT: '📋'
    };

    // ═══ RENDER ═══════════════════════════════════════
    return (
        <div>
            {/* Preview Mode */}
            {preview ? (
                <div style={{
                    backgroundColor: 'rgba(34, 197, 94, 0.06)',
                    border: '1px solid rgba(34, 197, 94, 0.2)',
                    borderRadius: '8px',
                    overflow: 'hidden'
                }}>
                    {/* Header */}
                    <div style={{
                        padding: '10px 12px',
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        borderBottom: '1px solid rgba(34, 197, 94, 0.15)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}>
                        <div>
                            <div style={{ fontSize: '0.78rem', fontWeight: '600', color: '#4ade80', marginBottom: '2px' }}>
                                {formatIcons[preview.format] || '📄'} {preview.fileName}
                            </div>
                            <div style={{ fontSize: '0.68rem', color: '#86efac' }}>
                                {typeLabels[preview.type]} · {preview.format}
                            </div>
                        </div>
                        <button
                            onClick={() => setPreview(null)}
                            style={{
                                background: 'none', border: 'none', color: '#64748b',
                                cursor: 'pointer', fontSize: '1rem', padding: '4px'
                            }}
                        >×</button>
                    </div>

                    {/* Stats */}
                    <div style={{ padding: '10px 12px' }}>
                        {dataStats.locations > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#cbd5e1', marginBottom: '4px' }}>
                                <span>📍 Locations</span>
                                <strong style={{ color: '#4ade80' }}>{dataStats.locations}</strong>
                            </div>
                        )}
                        {dataStats.clients > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#cbd5e1', marginBottom: '4px' }}>
                                <span>👤 Clients</span>
                                <strong style={{ color: '#4ade80' }}>{dataStats.clients}</strong>
                            </div>
                        )}
                        {preview.rows.length > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#cbd5e1' }}>
                                <span>Rows parsed</span>
                                <span style={{ color: '#94a3b8' }}>{preview.rows.length}</span>
                            </div>
                        )}

                        {/* Sample Data */}
                        {preview.headers.length > 0 && (
                            <div style={{
                                marginTop: '8px',
                                overflowX: 'auto',
                                borderRadius: '4px',
                                border: '1px solid rgba(255,255,255,0.06)',
                                backgroundColor: 'rgba(0,0,0,0.2)'
                            }}>
                                <table style={{
                                    width: '100%',
                                    fontSize: '0.65rem',
                                    color: '#94a3b8',
                                    borderCollapse: 'collapse'
                                }}>
                                    <thead>
                                        <tr>
                                            {preview.headers.slice(0, 5).map((h, i) => (
                                                <th key={i} style={{
                                                    padding: '4px 6px',
                                                    textAlign: 'left',
                                                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                                                    color: '#cbd5e1',
                                                    fontWeight: '600',
                                                    whiteSpace: 'nowrap'
                                                }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {preview.rows.slice(0, 3).map((row, i) => (
                                            <tr key={i}>
                                                {preview.headers.slice(0, 5).map((h, j) => (
                                                    <td key={j} style={{
                                                        padding: '3px 6px',
                                                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                                                        whiteSpace: 'nowrap',
                                                        maxWidth: '80px',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis'
                                                    }}>{row[h]}</td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                            <button
                                onClick={handleImport}
                                style={{
                                    flex: 1,
                                    padding: '7px',
                                    backgroundColor: 'var(--color-success)',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontSize: '0.78rem',
                                    fontWeight: '600',
                                    cursor: 'pointer'
                                }}
                            >
                                ✓ Import Data
                            </button>
                            <button
                                onClick={() => setPreview(null)}
                                style={{
                                    padding: '7px 12px',
                                    backgroundColor: 'rgba(255,255,255,0.05)',
                                    color: '#94a3b8',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    borderRadius: '6px',
                                    fontSize: '0.78rem',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                /* Upload Mode */
                <>
                    {/* Drag & Drop Zone */}
                    <div
                        onDragOver={onDragOver}
                        onDragLeave={onDragLeave}
                        onDrop={onDrop}
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                            padding: '20px 12px',
                            border: `2px dashed ${dragOver ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.1)'}`,
                            borderRadius: '8px',
                            backgroundColor: dragOver ? 'rgba(99,102,241,0.06)' : 'rgba(0,0,0,0.15)',
                            textAlign: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            marginBottom: '8px'
                        }}
                    >
                        {loading ? (
                            <div style={{ color: '#94a3b8', fontSize: '0.78rem' }}>
                                ⏳ Parsing file...
                            </div>
                        ) : (
                            <>
                                <div style={{ fontSize: '1.5rem', marginBottom: '6px' }}>
                                    {dragOver ? '📥' : '📂'}
                                </div>
                                <div style={{ fontSize: '0.78rem', color: '#cbd5e1', fontWeight: '500', marginBottom: '4px' }}>
                                    Drop file here or click to browse
                                </div>
                                <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
                                    CSV · Excel · PDF · JSON
                                </div>
                            </>
                        )}
                    </div>

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,.tsv,.txt,.xlsx,.xls,.pdf,.json"
                        onChange={(e) => {
                            const file = e.target.files[0];
                            if (file) processFile(file);
                            e.target.value = '';
                        }}
                        style={{ display: 'none' }}
                    />

                    {/* Paste Toggle */}
                    <button
                        onClick={() => setShowPaste(!showPaste)}
                        style={{
                            width: '100%',
                            padding: '6px',
                            background: 'none',
                            border: '1px solid rgba(255,255,255,0.06)',
                            borderRadius: '6px',
                            color: '#64748b',
                            fontSize: '0.72rem',
                            cursor: 'pointer',
                            marginBottom: showPaste ? '6px' : '8px',
                            transition: 'all 0.15s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = '#94a3b8'}
                        onMouseLeave={e => e.currentTarget.style.color = '#64748b'}
                    >
                        📋 {showPaste ? 'Hide' : 'Paste from clipboard'}
                    </button>

                    {showPaste && (
                        <div style={{ marginBottom: '8px' }}>
                            <textarea
                                value={pasteText}
                                onChange={(e) => setPasteText(e.target.value)}
                                placeholder="Paste tab-separated or comma-separated data here...&#10;Include header row first."
                                style={{
                                    width: '100%',
                                    height: '100px',
                                    padding: '8px',
                                    borderRadius: '6px',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    backgroundColor: 'rgba(0,0,0,0.3)',
                                    color: '#e2e8f0',
                                    fontSize: '0.72rem',
                                    fontFamily: 'monospace',
                                    resize: 'vertical',
                                    outline: 'none',
                                    marginBottom: '6px'
                                }}
                            />
                            <button
                                onClick={handlePaste}
                                disabled={!pasteText.trim()}
                                style={{
                                    width: '100%',
                                    padding: '6px',
                                    backgroundColor: pasteText.trim() ? 'var(--color-primary)' : 'rgba(255,255,255,0.04)',
                                    color: pasteText.trim() ? '#fff' : '#475569',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontSize: '0.75rem',
                                    fontWeight: '500',
                                    cursor: pasteText.trim() ? 'pointer' : 'not-allowed'
                                }}
                            >
                                Parse Pasted Data
                            </button>
                        </div>
                    )}

                    {/* Format Guide */}
                    <div style={{
                        padding: '8px 10px',
                        backgroundColor: 'rgba(255,255,255,0.03)',
                        borderRadius: '6px',
                        border: '1px solid rgba(255,255,255,0.04)',
                        marginBottom: '8px'
                    }}>
                        <div style={{ fontSize: '0.68rem', color: '#64748b', marginBottom: '4px', fontWeight: '600' }}>
                            Expected columns:
                        </div>
                        <div style={{ fontSize: '0.65rem', color: '#94a3b8', lineHeight: '1.6' }}>
                            <span style={{ color: '#cbd5e1' }}>Locations:</span>{' '}
                            <code style={{ color: '#93c5fd', fontSize: '0.62rem' }}>name, capacity</code>
                            <br />
                            <span style={{ color: '#cbd5e1' }}>Clients:</span>{' '}
                            <code style={{ color: '#93c5fd', fontSize: '0.62rem' }}>name, batteries, affiliate</code>
                            <br />
                            <span style={{ color: '#cbd5e1' }}>Manifest:</span>{' '}
                            <code style={{ color: '#93c5fd', fontSize: '0.62rem' }}>location name, capacity, client name, batteries, affiliate</code>
                        </div>
                    </div>

                    {/* Reset */}
                    <button
                        onClick={onReset}
                        style={{
                            width: '100%',
                            padding: '7px',
                            backgroundColor: 'rgba(239, 68, 68, 0.08)',
                            color: '#f87171',
                            border: '1px solid rgba(239, 68, 68, 0.15)',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            transition: 'all 0.15s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.08)'}
                    >
                        Reset to Default Data
                    </button>
                </>
            )}

            {/* Error */}
            {error && (
                <div style={{
                    marginTop: '8px',
                    color: '#f87171',
                    fontSize: '0.72rem',
                    padding: '8px 10px',
                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                    borderRadius: '6px',
                    border: '1px solid rgba(239, 68, 68, 0.15)'
                }}>
                    ⚠ {error}
                </div>
            )}
        </div>
    );
};

export default DataManagement;
