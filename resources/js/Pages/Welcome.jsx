import { Head, Link } from '@inertiajs/react';
import NavBar from '@/Components/NavBar';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faWallet,
    faCalendarAlt,
    faShieldAlt,
    faChartPie,
    faSignInAlt,
    faUserPlus
} from "@fortawesome/free-solid-svg-icons";
import Logo from '@/Components/Logo';
import IfSignupsOpen from '@/Components/IfSignupsOpen';

export default function Welcome({ auth }) {
    return (
        <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0F172A] selection:bg-indigo-500 selection:text-white overflow-hidden">
            <Head title="EMI Management Platform" />

            {/* Navigation */}
            <NavBar />

            {/* Hero Section */}
            <main className="relative pt-32 pb-20 px-4">
                {/* Background Blobs */}
                <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-[800px] h-[800px] bg-indigo-100/50 dark:bg-indigo-900/10 rounded-full blur-3xl -z-10"></div>
                <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-purple-100/50 dark:bg-purple-900/10 rounded-full blur-3xl -z-10"></div>

                <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center text-center lg:text-left">
                    <div className="space-y-8">
                        <div className="inline-flex items-center px-4 py-2 rounded-full bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 text-sm font-bold border border-indigo-100 dark:border-indigo-800">
                            <span className="flex h-2 w-2 rounded-full bg-indigo-600 mr-2 animate-pulse"></span>
                            A private EMI tracker
                        </div>
                        <h1 className="text-5xl lg:text-7xl font-black text-gray-900 dark:text-white leading-[1.1] tracking-tight">
                            Take Control of Your <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">EMI Portfolio</span>
                        </h1>
                        <p className="text-lg text-gray-600 dark:text-gray-400 max-w-xl mx-auto lg:mx-0">
                            Keep your loans, EMI schedules and due dates in one place, and stay ahead of what is due next.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                            {auth?.user ? (
                                <Link
                                    href={route('dashboard')}
                                    className="px-8 py-4 rounded-2xl bg-indigo-600 text-white font-black text-lg shadow-xl shadow-indigo-200 dark:shadow-indigo-900/40 hover:bg-indigo-700 transition-all hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-2"
                                >
                                    Go to Dashboard
                                </Link>
                            ) : (
                                <>
                                    <IfSignupsOpen>
                                        <Link
                                            href={route('register')}
                                            className="px-8 py-4 rounded-2xl bg-indigo-600 text-white font-black text-lg shadow-xl shadow-indigo-200 dark:shadow-indigo-900/40 hover:bg-indigo-700 transition-all hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-2"
                                        >
                                            <FontAwesomeIcon icon={faUserPlus} />
                                            Create Account
                                        </Link>
                                    </IfSignupsOpen>
                                    <Link
                                        href={route('login')}
                                        className="px-8 py-4 rounded-2xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-black text-lg border border-gray-200 dark:border-gray-700 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-all active:scale-95 flex items-center justify-center gap-2"
                                    >
                                        <FontAwesomeIcon icon={faSignInAlt} />
                                        Log In
                                    </Link>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="relative group">
                        <div className="absolute -inset-4 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-[2.5rem] opacity-20 blur-2xl group-hover:opacity-30 transition-opacity duration-500"></div>
                        <div className="relative rounded-[2rem] overflow-hidden shadow-2xl border-4 border-white dark:border-gray-800 bg-white dark:bg-gray-900">
                            <img
                                src="/emi_hero_bg.png"
                                alt="EMI Dashboard Preview"
                                className="w-full h-auto transition-transform duration-700 group-hover:scale-105"
                            />
                        </div>
                    </div>
                </div>

                {/* Features Grid */}
                <div className="max-w-7xl mx-auto mt-32 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                    <div className="p-8 rounded-3xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-xl transition-all duration-300">
                        <div className="w-14 h-14 bg-blue-50 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center text-blue-600 dark:text-blue-400 text-2xl mb-6">
                            <FontAwesomeIcon icon={faCalendarAlt} />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">Smart Scheduling</h3>
                        <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">
                            Never miss a payment with automated EMI tracking and timely reminders.
                        </p>
                    </div>

                    <div className="p-8 rounded-3xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-xl transition-all duration-300">
                        <div className="w-14 h-14 bg-purple-50 dark:bg-purple-900/30 rounded-2xl flex items-center justify-center text-purple-600 dark:text-purple-400 text-2xl mb-6">
                            <FontAwesomeIcon icon={faChartPie} />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">Principal Analytics</h3>
                        <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">
                            Watch your debt shrink with detailed breakdowns of principal vs interest.
                        </p>
                    </div>

                    <div className="p-8 rounded-3xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-xl transition-all duration-300">
                        <div className="w-14 h-14 bg-green-50 dark:bg-green-900/30 rounded-2xl flex items-center justify-center text-green-600 dark:text-green-400 text-2xl mb-6">
                            <FontAwesomeIcon icon={faShieldAlt} />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">Private</h3>
                        <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">
                            Served over HTTPS and stored on Google Cloud. Each account sees only its own loans and documents.
                        </p>
                    </div>

                    <div className="p-8 rounded-3xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-xl transition-all duration-300">
                        <div className="w-14 h-14 bg-orange-50 dark:bg-orange-900/30 rounded-2xl flex items-center justify-center text-orange-600 dark:text-orange-400 text-2xl mb-6">
                            <FontAwesomeIcon icon={faChartPie} />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">Instant Foreclose</h3>
                        <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">
                            Simulate and manage loan foreclosures with just a single click.
                        </p>
                    </div>
                </div>

                {/* Trust Footer */}
            </main>

            {/* Final Footer */}
            <footer className="border-t border-gray-100 dark:border-gray-800 py-12 px-4 bg-white dark:bg-gray-900">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
                    <Logo />
                    <p className="text-sm text-gray-500">
                        &copy; {new Date().getFullYear()} EMI Management Platform. All rights reserved.
                    </p>
                    <div className="flex gap-6 text-sm font-bold text-gray-600 dark:text-gray-400">
                        <Link href={route('privacy')} className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Privacy</Link>
                        <Link href={route('terms')} className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Terms</Link>
                        <Link href={route('support')} className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Support</Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}
