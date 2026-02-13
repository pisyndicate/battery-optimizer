'use client';
import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

let toastIdCounter = 0;

export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);

    const showToast = useCallback((message, type = 'info') => {
        const id = ++toastIdCounter;
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 3000);
    }, []);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {toasts.map(toast => (
                    <div
                        key={toast.id}
                        style={{
                            padding: '12px 16px',
                            backgroundColor: toast.type === 'error' ? '#ef4444' : toast.type === 'success' ? '#10b981' : '#3b82f6',
                            color: 'white',
                            borderRadius: '6px',
                            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                            fontSize: '0.875rem',
                            fontWeight: '500',
                            animation: 'slideIn 0.3s ease-out',
                            minWidth: '200px'
                        }}
                    >
                        {toast.message}
                    </div>
                ))}
            </div>
            <style jsx global>{`
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `}</style>
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};
