export const theme = {
    colors: {
        primary: '#2563EB', // Blue 600
        primaryLight: '#3B82F6', // Blue 500
        primaryDark: '#1E40AF', // Blue 800
        secondary: '#64748B', // Slate 500
        success: '#10B981', // Emerald 500
        warning: '#F59E0B', // Amber 500
        danger: '#E11D48', // Rose 600
        background: '#F8FAFC', // Slate 50
        surface: '#FFFFFF',
        text: {
            primary: '#1E293B', // Slate 800
            secondary: '#64748B', // Slate 500
            light: '#94A3B8', // Slate 400
        },
        border: '#E2E8F0', // Slate 200
    },
    shadows: {
        sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    },
    radius: {
        sm: '0.375rem',
        md: '0.5rem',
        lg: '0.75rem',
    }
};

/**
 * Generates a consistent HSL color string for a given text input.
 * Used to color-code affiliates consistently without manual assignment.
 */
export const getAffiliateColor = (name) => {
    if (!name) return '#cbd5e1'; // Default gray for unknown

    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }

    // Generate HSL
    // Hue: Full range 0-360 based on hash
    const h = Math.abs(hash % 360);
    // Saturation: 65-85% for vibrant but not neon
    const s = 65 + (Math.abs(hash) % 20);
    // Lightness: 45-60% for good contrast with white text, 
    // or use lighter pastel (85-95) if background.
    // Let's go with a medium-light pastel for backgrounds (80-90) 
    // and a darker border/text version.

    // For backgrounds (e.g. badges, progress bars)
    const l = 75 + (Math.abs(hash) % 15); // 75-90% lightness

    return `hsl(${h}, ${s}%, ${l}%)`;
};

export const getAffiliateColorDark = (name) => {
    if (!name) return '#64748b';

    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash % 360);
    const s = 65 + (Math.abs(hash) % 20);
    const l = 40 + (Math.abs(hash) % 10); // Darker for text/borders (40-50%)

    return `hsl(${h}, ${s}%, ${l}%)`;
};
