import './globals.css';
import { ToastProvider } from '@/contexts/ToastContext';

export const metadata = {
    title: 'Battery Allocation Optimizer',
    description: 'Optimize battery allocation across affiliates and locations',
};

export default function RootLayout({ children }) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body suppressHydrationWarning>
                <ToastProvider>
                    {children}
                </ToastProvider>
            </body>
        </html>
    );
}
