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

    const matrix = lines.map(line => parseLine(line));
    return { matrix };
}

function parseExcel(buffer) {
    const wb = XLSX.read(buffer, { type: 'array' });
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    // get raw array of arrays
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (rawData.length === 0) return { matrix: [] };

    const matrix = rawData.map(row => row.map(cell => String(cell).trim()));
    return { matrix };
}

function findHeaderRow(matrix) {
    for (let i = 0; i < Math.min(matrix.length, 500); i++) {
        const row = matrix[i];
        if (!row || row.length === 0 || row.every(c => !c)) continue;
        try {
            const type = detectDataType(row, [], null);
            return { index: i, type, headers: row };
        } catch (e) { }
    }
    return null;
}

async function parsePDF(buffer) {
    const pdfjs = await loadPdfJs();
    const pdf = await pdfjs.getDocument({ data: buffer }).promise;
    let allText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();

        // Group text items by Y position to reconstruct rows
        // Use a threshold for Y grouping (e.g. 4px) to handle slight misalignment
        const lineMap = new Map();

        content.items.forEach(item => {
            const y = Math.round(item.transform[5]); // Y position
            // Find existing Y that is very close
            let foundY = y;
            for (const key of lineMap.keys()) {
                if (Math.abs(key - y) < 4) {
                    foundY = key;
                    break;
                }
            }

            if (!lineMap.has(foundY)) lineMap.set(foundY, []);
            // Force estimation of width based on char count to avoid "ghost width" issues with PDFJS.
            // 4.5px per char is a conservative estimate for dense/small fonts.
            lineMap.get(foundY).push({
                x: item.transform[4],
                text: item.str,
                width: item.str.length * 4.5
            });
        });

        const sortedYs = Array.from(lineMap.keys()).sort((a, b) => b - a);
        sortedYs.forEach(y => {
            const items = lineMap.get(y).sort((a, b) => a.x - b.x);

            let line = '';
            let lastX = -1;

            items.forEach(item => {
                if (lastX >= 0) {
                    const gap = item.x - lastX;
                    if (gap > 15) {
                        line += '\t';
                    } else if (gap > 2) {
                        line += ' ';
                    }
                }
                line += item.text;
                lastX = item.x + item.width;
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

    // Normalize headers for fuzzy matching
    // - Lowercase
    // - Trim whitespace
    // - Collapse multiple spaces to single space
    const h = headers.map(hdr => String(hdr).toLowerCase().trim().replace(/\s+/g, ' '));

    const check = (keyword) => h.some(hdr => hdr.includes(keyword));

    const hasCapacity = check('capacity') || check('cap');
    const hasBatteries = check('batteries') || check('units') || check('count') || check('qty');
    const hasAffiliate = check('affiliate') || check('owner') || check('group');
    const hasLocationName = check('location') || check('site') || check('venue'); // 'location name', 'site name'
    const hasClientName = check('client') || check('name') || check('customer'); // 'client name', 'customer name'
    const hasId = check('id') || check('code');

    // Combined manifest (Location + Client columns)
    // Needs to be checked first as it often contains subset keywords
    if (hasLocationName && (hasClientName || hasAffiliate || hasBatteries)) {
        return 'manifest';
    }

    // Clients file (Client Name + Batteries/Affiliate)
    if (hasClientName && (hasBatteries || hasAffiliate)) {
        return 'clients';
    }

    // Locations file (Name/ID + Capacity)
    if (hasCapacity && (hasLocationName || hasId)) {
        return 'locations';
    }

    // Fallback: if we have "Location" and "Client" explicitly
    if (hasLocationName && hasClientName) {
        return 'manifest';
    }

    // If we only found 1 header and it's very long, maybe CSV parsing failed?
    if (headers.length === 1 && headers[0].length > 50) {
        throw new Error(`Could not parse columns. The file might not be tab/comma separated correctly. Found raw header: "${headers[0].substring(0, 50)}..."`);
    }

    throw new Error(`Could not determine data type. Found headers: [${headers.join(', ')}]`);
}

function parseNum(val) {
    if (!val) return NaN;
    return parseInt(String(val).replace(/[,\s$]/g, ''), 10);
}

// Helper to get value from row with aliases
function getVal(row, ...keys) {
    for (const key of keys) {
        if (row[key] !== undefined && row[key] !== '') return row[key];
    }
    return undefined;
}

function extractData(type, headers, rows, structured) {
    // If structured JSON, try to use it directly
    if (type === 'manifest' && structured) {
        const result = {};
        if (structured.locations) {
            result.locations = structured.locations.map(l => ({
                id: l.id,
                name: l.name || l.location,
                capacity: parseInt(l.capacity, 10)
            })).filter(l => l.id && l.name && !isNaN(l.capacity));
        }
        if (structured.clients) {
            result.clients = structured.clients.map((c, idx) => ({
                id: c.id || `c_json_${idx}`,
                name: c.name || c.client,
                batteries: parseInt(c.batteries || c.units || c.count, 10),
                affiliate: c.affiliate
            })).filter(c => c.name && !isNaN(c.batteries) && c.affiliate);
        }
        return result;
    }

    if (type === 'manifest') {
        const locationMap = new Map();
        const clientMap = new Map();

        rows.forEach((row, idx) => {
            const locName = getVal(row, 'location name', 'location', 'site', 'venue');
            const locCap = parseNum(getVal(row, 'location capacity', 'capacity', 'cap'));
            const locId = row['id'] || (locName ? `LOC_${locName.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}` : null);

            if (locName && !isNaN(locCap) && !locationMap.has(locName)) {
                locationMap.set(locName, { id: locId, name: locName, capacity: locCap });
            }

            const clientName = getVal(row, 'client name', 'client', 'name', 'customer');
            const batteries = parseNum(getVal(row, 'batteries', 'units', 'count', 'qty'));
            const affiliate = getVal(row, 'affiliate', 'owner', 'group');

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
            id: l.id || `LOC_${(getVal(l, 'name', 'location', 'site') || '').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}`,
            name: getVal(l, 'name', 'location', 'site', 'venue'),
            capacity: parseNum(getVal(l, 'capacity', 'cap'))
        })).filter(l => l.name && !isNaN(l.capacity));
        return { locations };
    }

    if (type === 'clients') {
        const clients = rows.map((c, idx) => ({
            id: c.id || `c_up_${idx}`,
            name: getVal(c, 'name', 'client', 'client name', 'customer'),
            batteries: parseNum(getVal(c, 'batteries', 'units', 'count', 'qty')),
            affiliate: getVal(c, 'affiliate', 'owner', 'group')
        })).filter(c => c.name && !isNaN(c.batteries) && c.affiliate);
        return { clients };
    }

    throw new Error('Could not determine data type');
}

// ─── Special Parser for Grouped Manifests (PDF/App Export) ─────────────
// ─── Special Parser for Grouped Manifests (PDF/App Export) ─────────────
function parseGroupedManifest(matrix) {
    // Detect if this is likely our app's export
    const isAppExport = matrix.slice(0, 5).some(row =>
        row.some(c => String(c).includes('Allocation Manifest'))
    );

    // Find all header rows (Affiliate, Client, Units)
    const headerIndices = [];
    matrix.forEach((row, idx) => {
        const str = row.map(c => String(c).toLowerCase().trim()).join(' ');
        if (str.includes('affiliate') && str.includes('client') && str.includes('units')) {
            headerIndices.push(idx);
        }
    });

    if (headerIndices.length === 0) return null;

    // If we have headers and it looks like an export (or multiple headers), try to parse
    const clients = [];
    const locations = [];
    const locationMap = new Map(); // name -> id

    // Keep track of last location to handle page breaks where title isn't repeated
    let lastLocId = null;
    let lastLocName = null;

    headerIndices.forEach((headerIdx, i) => {
        let locName = null;
        let locId = null;
        let locCap = 0;

        // Detect column mapping for this section
        const headerRow = matrix[headerIdx].map(c => String(c).toLowerCase().trim());
        const hasLocationCol = headerRow.some(c => c.includes('location'));

        // Default mapping (3 cols): Affiliate, Client, Units
        let colMap = { affiliate: 0, client: 1, units: 2, location: -1 };

        if (hasLocationCol) {
            // New 4-col layout: Location, Affiliate, Client, Units
            // But we need to be dynamic to be safe.
            // Simple heuristic: If 4 cols, assume Loc, Aff, Client, Units?
            // Or look for indices
            const locIdx = headerRow.findIndex(c => c.includes('location'));
            const affIdx = headerRow.findIndex(c => c.includes('affiliate'));
            const cliIdx = headerRow.findIndex(c => c.includes('client'));
            const unitIdx = headerRow.findIndex(c => c.includes('units') || c.includes('batteries'));

            if (locIdx !== -1 && affIdx !== -1 && cliIdx !== -1 && unitIdx !== -1) {
                colMap = { affiliate: affIdx, client: cliIdx, units: unitIdx, location: locIdx };
            }
        }

        // Search upwards for "Name (ID)" pattern (Group Header)
        // Only do this if we DO NOT have a Location Column.
        // If we have a Location Column, the location is IN the data row, not above.
        // Search upwards for "Name (ID)" pattern (Group Header)
        // Only do this if we DO NOT have a Location Column.
        if (!hasLocationCol) {
            for (let offset = 1; offset <= 5; offset++) {
                const rowIdx = headerIdx - offset;
                if (rowIdx < 0) break;
                const row = matrix[rowIdx];
                if (!row || row.length === 0) continue;

                const line = row.join(' ').trim();

                // Ignore capacity/summary lines
                if (line.includes('/') || line.includes('Rem:') || line.includes('Total Locations')) continue;
                // Ignore dates
                if (line.match(/\d+\/\d+\/\d+/)) continue;

                // Check for "Name (ID)" pattern
                const idMatch = line.match(/(.+)\s+\((.+)\)$/);
                if (idMatch) {
                    locName = idMatch[1].trim();
                    locId = idMatch[2].trim();
                    break;
                }

                // Partial ID match
                if (line.startsWith('(') && line.endsWith(')')) continue; // Orphan ID

                // Fallback: This line is likely the name if it's text
                // Avoid capturing garbage
                if (locName === null &&
                    line !== 'Allocation Manifest' &&
                    !line.includes('Page ') &&
                    line.length > 2 &&
                    line.split(' ').length < 6) {
                    locName = line;
                }
            }
        }

        if (hasLocationCol && !locName) {
            // Peek at first data row
            const firstDataRow = matrix[headerIdx + 1];
            if (firstDataRow && firstDataRow.length > colMap.location) {
                const potentialName = firstDataRow[colMap.location];
                if (potentialName && potentialName.split(' ').length < 6) {
                    locName = potentialName;
                }
            }
        }

        // If we found a new location header, register it
        if (locName) {
            // Check if it's the SAME as last one (repeated title on new page)
            if (lastLocName && locName === lastLocName) {
                locId = lastLocId;
            } else {
                if (!locId) locId = `LOC_${locName.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}`;

                if (!locationMap.has(locName)) {
                    // Try to find capacity in the vicinity (look 1-4 lines up)
                    // Pattern: "LocationName (RExxxx) Used / Capacity"
                    // Also robustly ignore dates (e.g. 2/13/26) and URLs.
                    let bestCap = null;

                    for (let offset = 1; offset <= 4; offset++) {
                        const r = matrix[headerIdx - offset];
                        if (r) {
                            const l = r.join(' ');

                            // 1. Check for explicit (RExxxx) line with Capacity style "X / Y" or "X / Y Rem"
                            // Matches "5,004 / 5,004" or "838 / 951"
                            // Regex updated to allow spaces: "( RE 0305 )"
                            const reMatch = l.match(/\(\s*RE\d+\s*\).*?([\d,]+)\s*\/\s*([\d,]+)/i);
                            if (reMatch) {
                                // High confidence, this is the location line
                                bestCap = parseNum(reMatch[2]);
                                locName = l.split(/\s+\d+\s*\//)[0].trim(); // Extract name part before numbers
                                // Clean up trailing garbage if needed
                                if (locName.includes('(')) {
                                    // keep (RExxxx) part? It's usually good.
                                    // The user wants clean names. "Aurora (RE0305)" is fine.
                                }
                                break;
                            }

                            // 2. Fallback: Just look for "X / Y" avoiding dates
                            if (l.includes('/') && !bestCap) {
                                if (l.match(/\d+\/\d+\/\d+/) || l.includes('http') || l.includes('localhost')) continue;
                                const parts = l.split('/');
                                if (parts.length > 1) {
                                    // "Used / Total" -> we want Total (index 1) which might have "Rem: ..." attached
                                    // clean it up:
                                    let rawCap = parts[1].replace(/Rem:.*$/i, '').trim();
                                    // remove non-numeric except comma
                                    // actually parseNum handles commas.
                                    // But if it's "5,004 Rem: 113", parseNum("5,004 Rem: 113") might be weird?
                                    // No, usually just takes valid number start.
                                    const cap = parseNum(rawCap.split(' ')[0]); // Take first token after slash
                                    if (!isNaN(cap) && cap > 20) { // Capacity usually > 20? 
                                        // If it finds "1 / 32" (page num), cap=32 might be dangerously low but valid? 
                                        // But user sees "13 / 13" which was wrong.
                                        // Let's rely heavily on the RE match. 
                                        // If fallback is used, ensure > 50?
                                        bestCap = cap;
                                    }
                                }
                            }
                        }
                    }
                    if (bestCap) locCap = bestCap;

                    locations.push({ id: locId, name: locName, capacity: locCap || 1000 });
                    locationMap.set(locName, locId);
                } else {
                    locId = locationMap.get(locName);
                }
            }
            lastLocId = locId;
            lastLocName = locName;
        } else {
            // No header found above this table. Inherit previous!
            if (lastLocId) {
                locId = lastLocId;
            } else {
                // Truly unknown (start of file?)
                locId = 'LOC_UNKNOWN';
                if (!locationMap.has('Unknown Location')) {
                    locations.push({ id: locId, name: 'Unknown Location', capacity: 0 });
                    locationMap.set('Unknown Location', locId);
                }
                lastLocId = locId;
            }
        }

        // Parse rows until next header or end
        const nextHeaderIdx = headerIndices[i + 1] || matrix.length;

        for (let r = headerIdx + 1; r < nextHeaderIdx; r++) {
            const row = matrix[r];
            if (!row || row.length === 0) continue;

            // Skip footer/summary lines
            const line = row.join(' ');
            if (line.includes('Total Locations') ||
                line.includes('Allocation Manifest') ||
                line.startsWith('Page ') ||
                line.match(/^\d+\/\d+\/\d+/) // Date footer
            ) continue;

            let affiliate = '', client = '', units = 0;
            const cleanRow = row.filter(c => c && c.trim().length > 0);

            // Dynamic mapping based on content length
            if (hasLocationCol) {
                if (cleanRow.length === 3) {
                    // Implied location: [Affiliate, Client, Units]
                    affiliate = cleanRow[0];
                    client = cleanRow[1];
                    units = parseNum(cleanRow[2]);
                } else if (cleanRow.length >= 4) {
                    // Explicit location: [Location, Affiliate, Client, Units] (mapped by index)
                    // If cleanRow handles it, great. If using raw 'row' with gaps, use colMap.
                    // colMap relies on index. 
                    // To be safe, let's use the explicit map if length is sufficient.
                    affiliate = row[colMap.affiliate];
                    client = row[colMap.client];
                    units = parseNum(row[colMap.units]);
                } else {
                    // Try standard map anyway
                    affiliate = row[colMap.affiliate];
                    client = row[colMap.client];
                    units = parseNum(row[colMap.units]);
                }
            } else {
                // Fallback valid for 3-col (No Location Column)
                if (cleanRow.length >= 3) {
                    affiliate = row[colMap.affiliate];
                    client = row[colMap.client];
                    units = parseNum(row[colMap.units]);
                } else if (cleanRow.length === 2) {
                    units = parseNum(cleanRow[1]);
                    client = cleanRow[0];
                }
            }

            // Filter out Ghost Clients (Headers repeated or keywords in data)
            const cLower = (client || '').toLowerCase();
            if (cLower === 'client' ||
                cLower === 'units' ||
                cLower === 'affiliate' ||
                cLower.includes('page ') ||
                cLower.includes('generated') ||
                cLower.startsWith('(') || // Matches (RE0302)
                cLower.includes('(re') || // Matches inner (RExxxx)
                cLower.includes('used') || // Matches capacity line
                cLower.includes('capacity') ||
                /^\d/.test(cLower) || // Matches ANY number at start (Location Headers like 0 Dade)
                /^\d+\s+[nsew]\.?\s+/i.test(cLower) // Matches 412 N Main, 12 S St
            ) continue;

            const aLower = (affiliate || '').toLowerCase();
            // Sanitize Affiliate - if invalid, clear it but KEEP THE ROW (unless client is also invalid)
            if (aLower.startsWith('(') ||
                aLower.includes('(re') ||
                aLower.includes('used') ||
                aLower.includes('capacity') ||
                /^\d/.test(aLower) // Affiliate shouldn't start with a number
            ) {
                affiliate = 'Unknown';
            }

            if (client && !isNaN(units)) {
                clients.push({
                    id: `c_pdf_${Math.random().toString(36).substr(2, 9)}`,
                    name: client,
                    batteries: units,
                    affiliate: affiliate || 'Unknown',
                    initialLocationId: locId // specific to PDF parsing where location is known
                });
            }
        }
    });

    return { locations, clients };
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
            let headers = [], rows = [], structured = null, type = null;
            let matrix = null;
            let data = null;

            if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
                const text = await file.text();
                ({ matrix } = parseCSV(text));
            } else if (ext === 'xlsx' || ext === 'xls') {
                const buffer = await file.arrayBuffer();
                ({ matrix } = parseExcel(buffer));
            } else if (ext === 'pdf') {
                const buffer = await file.arrayBuffer();
                ({ matrix } = await parsePDF(buffer));
            } else if (ext === 'json') {
                const text = await file.text();
                const result = parseJSON(text);
                headers = result.headers;
                rows = result.rows;
                structured = result.structured || null;
            } else {
                throw new Error(`Unsupported format: .${ext}`);
            }

            // Handle Matrix (CSV/Excel/PDF)
            if (matrix) {
                // Check for Grouped Manifest (PDF)
                const groupedData = parseGroupedManifest(matrix);
                if (groupedData) {
                    type = 'manifest';
                    headers = ['Derived from PDF'];
                    rows = groupedData.clients; // just for preview count
                    data = groupedData;
                } else {
                    if (matrix.length === 0) throw new Error('No data rows found in the file');

                    const res = findHeaderRow(matrix);
                    if (!res) {
                        // Try to detect on first row just to throw the detailed error
                        detectDataType(matrix[0].map(String), [], null);
                        throw new Error('Could not find a valid header row in the first 25 lines.');
                    }

                    type = res.type;
                    headers = res.headers;
                    const headerIndex = res.index;

                    // Process rows
                    const lowerHeaders = headers.map(h => String(h).toLowerCase().trim());
                    rows = [];
                    for (let i = headerIndex + 1; i < matrix.length; i++) {
                        const row = matrix[i];
                        if (!row || row.length === 0 || row.every(c => !c)) continue;

                        const entry = {};
                        lowerHeaders.forEach((h, colIdx) => {
                            const val = row[colIdx];
                            entry[h] = val !== undefined ? String(val).trim() : '';
                        });

                        if (Object.values(entry).some(v => v)) {
                            rows.push(entry);
                        }
                    }
                    data = extractData(type, headers, rows, structured);
                }
            } else {
                // JSON path
                type = detectDataType(headers, rows, structured);
                data = extractData(type, headers, rows, structured);
            }

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
            const { matrix } = parseCSV(pasteText);
            if (!matrix || matrix.length === 0) throw new Error('No data rows found in pasted text');

            const res = findHeaderRow(matrix);
            if (!res) {
                detectDataType(matrix[0].map(String), [], null);
                throw new Error('Could not find a valid header row in pasted text.');
            }

            const { type, headers, index } = res;
            const lowerHeaders = headers.map(h => String(h).toLowerCase().trim());

            const rows = [];
            for (let i = index + 1; i < matrix.length; i++) {
                const row = matrix[i];
                if (!row || row.length === 0) continue;
                const entry = {};
                lowerHeaders.forEach((h, colIdx) => {
                    const val = row[colIdx];
                    entry[h] = val !== undefined ? String(val).trim() : '';
                });
                if (Object.values(entry).some(v => v)) rows.push(entry);
            }

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
