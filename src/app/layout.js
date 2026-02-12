import './globals.css';

export const metadata = {
    title: 'Battery Allocation Optimizer',
    description: 'Optimize battery allocation across affiliates and locations',
};

export default function RootLayout({ children }) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body suppressHydrationWarning>{children}</body>
        </html>
    );
}
