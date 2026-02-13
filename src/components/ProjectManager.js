'use client';
import React, { useState, useEffect } from 'react';

const STORAGE_KEY = 'battery-optimizer-projects';
const ACTIVE_KEY = 'battery-optimizer-active-project';

// Get all saved projects from localStorage
export const getProjects = () => {
    if (typeof window === 'undefined') return [];
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch { return []; }
};

// Save a project
export const saveProject = (name, state) => {
    const projects = getProjects();
    const id = `proj_${Date.now()}`;
    const project = {
        id,
        name,
        savedAt: new Date().toISOString(),
        state
    };
    // Check if name already exists — update it
    const existingIdx = projects.findIndex(p => p.name === name);
    if (existingIdx >= 0) {
        projects[existingIdx] = { ...project, id: projects[existingIdx].id };
    } else {
        projects.unshift(project);
    }
    if (typeof window === 'undefined') return project;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    localStorage.setItem(ACTIVE_KEY, existingIdx >= 0 ? projects[existingIdx].id : id);
    return project;
};

// Delete a project
export const deleteProject = (id) => {
    if (typeof window === 'undefined') return;
    const projects = getProjects().filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    const activeId = localStorage.getItem(ACTIVE_KEY);
    if (activeId === id) localStorage.removeItem(ACTIVE_KEY);
};

// Get last active project
export const getActiveProject = () => {
    if (typeof window === 'undefined') return null;
    const activeId = localStorage.getItem(ACTIVE_KEY);
    if (!activeId) return null;
    return getProjects().find(p => p.id === activeId) || null;
};

// Set active project
export const setActiveProject = (id) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(ACTIVE_KEY, id);
};

export const clearAllProjects = () => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(ACTIVE_KEY);
};

const ProjectManager = ({ onLoadState, onNewProject, currentStateFn }) => {
    const [projects, setProjects] = useState([]);
    const [saveName, setSaveName] = useState('');
    const [showSaveInput, setShowSaveInput] = useState(false);
    const [activeId, setActiveId] = useState(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setProjects(getProjects());
        setActiveId(typeof window !== 'undefined' ? localStorage.getItem(ACTIVE_KEY) : null);
        setMounted(true);
    }, []);

    const refreshProjects = () => {
        setProjects(getProjects());
        setActiveId(localStorage.getItem(ACTIVE_KEY));
    };

    const handleSave = () => {
        const name = saveName.trim();
        if (!name) return;
        const state = currentStateFn();
        saveProject(name, state);
        setSaveName('');
        setShowSaveInput(false);
        refreshProjects();
    };

    const handleQuickSave = () => {
        // If there's an active project, overwrite it
        if (activeId) {
            const active = projects.find(p => p.id === activeId);
            if (active) {
                const state = currentStateFn();
                saveProject(active.name, state);
                refreshProjects();
                return true;
            }
        }
        // Otherwise show the save input
        setShowSaveInput(true);
        return false;
    };

    const handleLoad = (project) => {
        setActiveProject(project.id);
        setActiveId(project.id);
        onLoadState(project.state);
    };

    const handleDelete = (id, name) => {
        deleteProject(id);
        refreshProjects();
    };

    const handleNew = () => {
        localStorage.removeItem(ACTIVE_KEY);
        setActiveId(null);
        onNewProject();
    };

    const formatDate = (iso) => {
        const d = new Date(iso);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
            ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    };

    const buttonBase = {
        padding: '8px 12px',
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
        transition: 'all 0.15s ease',
        width: '100%'
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Quick Save / Save As */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button
                    onClick={handleQuickSave}
                    style={buttonBase}
                    title={activeId ? 'Overwrite current project' : 'Save as new project'}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#1e293b'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#0f172a'; }}
                >
                    💾 {activeId ? 'Save' : 'Save As'}
                </button>
                <button
                    onClick={() => setShowSaveInput(!showSaveInput)}
                    style={buttonBase}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#1e293b'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#0f172a'; }}
                >
                    📝 Save As New
                </button>
            </div>

            {/* Save Input */}
            {showSaveInput && (
                <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                        type="text"
                        placeholder="Project name..."
                        value={saveName}
                        onChange={e => setSaveName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSave()}
                        autoFocus
                        style={{
                            flex: 1,
                            padding: '8px 10px',
                            borderRadius: '6px',
                            border: '1px solid #475569',
                            backgroundColor: '#0f172a',
                            color: '#e2e8f0',
                            fontSize: '0.8rem',
                            outline: 'none'
                        }}
                        aria-label="Project name"
                    />
                    <button
                        onClick={handleSave}
                        disabled={!saveName.trim()}
                        style={{
                            padding: '8px 14px',
                            borderRadius: '6px',
                            border: 'none',
                            backgroundColor: saveName.trim() ? 'var(--color-success, #22c55e)' : '#334155',
                            color: 'white',
                            fontSize: '0.8rem',
                            fontWeight: '600',
                            cursor: saveName.trim() ? 'pointer' : 'not-allowed'
                        }}
                    >
                        ✓
                    </button>
                </div>
            )}

            {/* New Project */}
            <button
                onClick={handleNew}
                style={{
                    ...buttonBase,
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    color: '#60a5fa',
                    border: '1px solid rgba(59, 130, 246, 0.2)'
                }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.2)'; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.1)'; }}
            >
                ✨ New Project
            </button>

            {/* Saved Projects List */}
            {projects.length > 0 && (
                <div>
                    <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>
                        Saved Projects ({projects.length})
                    </span>
                    <div style={{
                        marginTop: '6px',
                        maxHeight: '200px',
                        overflowY: 'auto',
                        borderRadius: '6px',
                        border: '1px solid #334155',
                        backgroundColor: '#0f172a'
                    }}>
                        {projects.map(p => (
                            <div
                                key={p.id}
                                style={{
                                    padding: '10px 12px',
                                    borderBottom: '1px solid #1e293b',
                                    backgroundColor: p.id === activeId ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                                    transition: 'background-color 0.15s'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{
                                            fontSize: '0.8rem',
                                            fontWeight: '600',
                                            color: p.id === activeId ? '#60a5fa' : '#e2e8f0',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px'
                                        }}>
                                            {p.id === activeId && <span style={{ fontSize: '0.6rem' }}>●</span>}
                                            {p.name}
                                        </div>
                                        <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '2px' }}>
                                            {formatDate(p.savedAt)}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0, marginLeft: '8px' }}>
                                        <button
                                            onClick={() => handleLoad(p)}
                                            style={{
                                                padding: '4px 10px',
                                                fontSize: '0.7rem',
                                                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                                                color: '#60a5fa',
                                                border: '1px solid rgba(59, 130, 246, 0.25)',
                                                borderRadius: '4px',
                                                cursor: 'pointer',
                                                fontWeight: '600'
                                            }}
                                        >
                                            Open
                                        </button>
                                        <button
                                            onClick={() => handleDelete(p.id, p.name)}
                                            style={{
                                                padding: '4px 8px',
                                                fontSize: '0.7rem',
                                                backgroundColor: 'transparent',
                                                color: '#64748b',
                                                border: '1px solid #334155',
                                                borderRadius: '4px',
                                                cursor: 'pointer'
                                            }}
                                            title="Delete project"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProjectManager;
