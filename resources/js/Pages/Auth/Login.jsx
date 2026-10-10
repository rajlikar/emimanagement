import { useEffect, useRef } from 'react';
import Checkbox from '@/Components/Checkbox';
import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import PrimaryButton from '@/Components/PrimaryButton';
import TextInput from '@/Components/TextInput';
import GuestLayout from '@/Layouts/GuestLayout';
import { Head, Link, useForm } from '@inertiajs/react';
import IfSignupsOpen from '@/Components/IfSignupsOpen';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSignInAlt } from "@fortawesome/free-solid-svg-icons";
import { faGoogle } from "@fortawesome/free-brands-svg-icons";

export default function Login({ status, canResetPassword }) {
    const { data, setData, post, processing, errors, reset } = useForm({
        email: '',
        password: '',
        remember: false,
        cfTurnstileResponse: ''
    });

    const submit = (e) => {
        e.preventDefault();

        post(route('login'), {
            onFinish: () => reset('password'),
        });
    };

    const turnstileRef = useRef(null);

    useEffect(() => {
        const renderTurnstile = () => {
            if (window.turnstile && turnstileRef.current) {
                turnstileRef.current.innerHTML = '';
                window.turnstile.render(turnstileRef.current, {
                    sitekey: import.meta.env.VITE_TURNSTILE_SITE_KEY, // Add from env file
                    callback: (token) => {
                        setData('cfTurnstileResponse', token);
                    },
                });
            }
        };

        if (window.turnstile) {
            renderTurnstile();
        } else {
            const interval = setInterval(() => {
                if (window.turnstile) {
                    clearInterval(interval);
                    renderTurnstile();
                }
            }, 100);
            return () => clearInterval(interval);
        }
    }, []);

    return (
        <GuestLayout>
            <Head title="Log in" />

            <div className="mb-8 text-center">
                <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">
                    Welcome Back
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                    Enter your credentials to access your dashboard
                </p>
            </div>

            {status && (
                <div className="mb-6 p-4 rounded-xl bg-green-50 dark:bg-green-900/20 text-sm font-bold text-green-600 dark:text-green-400 border border-green-100 dark:border-green-800 animate-pulse">
                    {status}
                </div>
            )}

            <form onSubmit={submit} className="space-y-6">
                <div>
                    <InputLabel htmlFor="email" value="Email Address" className="font-bold text-gray-700 dark:text-gray-300" />

                    <TextInput
                        id="email"
                        type="email"
                        name="email"
                        value={data.email}
                        className="mt-1 block w-full"
                        placeholder="your@email.com"
                        autoComplete="username"
                        isFocused={true}
                        onChange={(e) => setData('email', e.target.value)}
                    />

                    <InputError message={errors.email} className="mt-2" />
                </div>

                <div>
                    <div className="flex justify-between items-center">
                        <InputLabel htmlFor="password" value="Password" className="font-bold text-gray-700 dark:text-gray-300" />
                        {canResetPassword && (
                            <Link
                                href={route('password.request')}
                                className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                            >
                                Forgot password?
                            </Link>
                        )}
                    </div>

                    <TextInput
                        id="password"
                        type="password"
                        name="password"
                        value={data.password}
                        className="mt-1 block w-full"
                        placeholder="••••••••"
                        autoComplete="current-password"
                        onChange={(e) => setData('password', e.target.value)}
                    />

                    <InputError message={errors.password} className="mt-2" />
                </div>

                <div className="flex items-center">
                    <Checkbox
                        name="remember"
                        checked={data.remember}
                        onChange={(e) =>
                            setData('remember', e.target.checked)
                        }
                    />
                    <span className="ms-2 text-sm font-medium text-gray-600 dark:text-gray-400">
                        Stay logged in
                    </span>
                </div>

                <div className="mt-4 flex justify-start">
                    <div
                        className="cf-turnstile"
                        ref={turnstileRef}
                    ></div>
                </div>

                <div className="pt-2">
                    <PrimaryButton
                        className="w-full justify-center py-4 rounded-2xl text-lg font-black shadow-lg shadow-indigo-200 dark:shadow-indigo-900/20 active:scale-[0.98] transition-all"
                        disabled={processing}
                    >
                        <FontAwesomeIcon icon={faSignInAlt} className="mr-2" />
                        Sign In
                    </PrimaryButton>
                </div>

                <IfSignupsOpen>
                    <div className="text-center mt-8">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Don't have an account?{' '}
                            <Link
                                href={route('register')}
                                className="font-black text-indigo-600 dark:text-indigo-400 hover:underline"
                            >
                                Create Account
                            </Link>
                        </p>
                    </div>
                </IfSignupsOpen>
                <div className="relative py-4">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-200 dark:border-gray-800"></div>
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-white dark:bg-gray-900 px-4 text-gray-500 font-black tracking-widest">
                            Or continue with
                        </span>
                    </div>
                </div>

                <div className="pt-2">
                    <a
                        href={route('auth.google')}
                        className="flex w-full items-center justify-center gap-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 py-4 px-4 text-sm font-black text-gray-700 dark:text-gray-200 transition-all hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:shadow-md hover:border-gray-300 dark:hover:border-gray-700 active:scale-[0.98]"
                    >
                        <FontAwesomeIcon icon={faGoogle} className="text-xl text-red-500" />
                        <span>Sign in with Google</span>
                    </a>
                </div>
            </form>
        </GuestLayout>
    );
}
