import { usePage } from '@inertiajs/react';

// Renders its children only while account creation is open (ALLOWED_EMAILS unset).
export default function IfSignupsOpen({ children }) {
    const { signupsOpen } = usePage().props;
    return signupsOpen ? children : null;
}
