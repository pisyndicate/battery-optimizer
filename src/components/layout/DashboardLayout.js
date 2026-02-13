'use client';
import React from 'react';

const DashboardLayout = ({
    children,
    sidebarContent,
    headerContent,
    isSidebarOpen = true,
    setIsSidebarOpen
}) => {
    return (
        <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', backgroundColor: 'var(--color-bg)' }}>

            {/* Sidebar */}
            <aside style={{
                width: isSidebarOpen ? '320px' : '0px',
                backgroundColor: '#1e293b', // Dark slate for sidebar
                color: 'white',
                display: 'flex',
                flexDirection: 'column',
                transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                overflow: 'hidden',
                flexShrink: 0,
                boxShadow: '4px 0 24px rgba(0,0,0,0.1)',
                zIndex: 20
            }}>
                <div style={{
                    padding: '20px',
                    borderBottom: '1px solid rgba(255,255,255,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minHeight: '70px'
                }}>
                    <div>
                        <h1 style={{ fontSize: '1.1rem', fontWeight: 'bold', letterSpacing: '-0.5px' }}>Battery Optimizer</h1>
                        <p style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Expert Edition</p>
                    </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                    {sidebarContent}
                </div>

                <div style={{ padding: '16px', borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center' }}>
                    v2.0.0
                </div>
            </aside>

            {/* Main Content */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>

                {/* Header */}
                <header style={{
                    height: '70px',
                    backgroundColor: 'var(--color-surface)',
                    borderBottom: '1px solid var(--color-border)',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 24px',
                    justifyContent: 'space-between',
                    boxShadow: 'var(--shadow-sm)',
                    zIndex: 10
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
                        {setIsSidebarOpen && (
                            <button
                                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: '8px',
                                    borderRadius: '4px',
                                    color: 'var(--color-text-secondary)'
                                }}
                            >
                                {isSidebarOpen ? '◀' : '▶'}
                            </button>
                        )}
                        {headerContent}
                    </div>
                </header>

                {/* Content Scroll Area */}
                <main style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '32px',
                    position: 'relative'
                }}>
                    <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
};

export default DashboardLayout;
