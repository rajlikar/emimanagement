import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link, usePage } from '@inertiajs/react';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faPlus,
    faList,
    faUser,
    faWallet,
    faCalendarCheck,
    faChartLine,
    faHandHoldingUsd,
    faFileInvoiceDollar,
    faCheckCircle,
    faTimesCircle,
    faHourglassHalf,
    faMoneyBillWave,
    faCoins
} from "@fortawesome/free-solid-svg-icons";
import {
    Chart as ChartJS,
    ArcElement,
    Tooltip,
    Legend,
    CategoryScale,
    LinearScale,
    BarElement
} from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

export default function Dashboard({ stats }) {
    const { auth } = usePage().props;

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(amount);
    };

    const FinancialCard = ({ title, value, icon, gradient, subText }) => (
        <div className={`relative overflow-hidden rounded-3xl p-6 shadow-xl ${gradient} text-white transition-transform duration-300 hover:-translate-y-1 hover:shadow-2xl`}>
            {/* Background Decoration */}
            <div className="absolute -right-4 -top-4 text-white/10 text-9xl">
                <FontAwesomeIcon icon={icon} />
            </div>

            <div className="relative z-10">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-white/20 backdrop-blur-sm rounded-lg">
                        <FontAwesomeIcon icon={icon} className="text-xl" />
                    </div>
                    <h4 className="font-bold text-indigo-50 uppercase tracking-widest text-xs">{title}</h4>
                </div>
                <div className="space-y-1">
                    <p className="text-3xl font-black tracking-tight">{value}</p>
                    <p className="text-sm font-medium text-white/70">{subText}</p>
                </div>
            </div>
        </div>
    );

    const StatCard = ({ title, value, icon, colorClass, bgClass, subText }) => (
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-lg transition-all duration-300 group">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">{title}</p>
                    <h4 className="text-2xl font-black text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{value}</h4>
                    {subText && <span className="text-[10px] py-0.5 px-2 bg-gray-50 dark:bg-gray-700 rounded-full text-gray-500 dark:text-gray-400 mt-2 inline-block font-medium">{subText}</span>}
                </div>
                <div className={`p-3 rounded-xl ${bgClass} group-hover:scale-110 transition-transform duration-300`}>
                    <FontAwesomeIcon icon={icon} className={`${colorClass} text-lg`} />
                </div>
            </div>
        </div>
    );

    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col md:flex-row justify-between items-end md:items-center gap-4">
                    <div>
                        <h2 className="text-3xl font-black text-gray-900 dark:text-white leading-tight">
                            Dashboard
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Welcome back, <span className="font-bold text-indigo-600 dark:text-indigo-400">{auth.user.name.split(' ')[0]}</span>. Here's your financial overview.
                        </p>
                    </div>

                    <Link
                        href={route("loan-detail.create")}
                        className="inline-flex items-center px-5 py-2.5 rounded-xl bg-indigo-600 dark:bg-indigo-500 text-white text-sm font-bold shadow-lg hover:bg-indigo-500 dark:hover:bg-indigo-400 hover:shadow-xl hover:-translate-y-0.5 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 dark:focus:ring-indigo-300 dark:focus:ring-offset-gray-900"
                    >
                        <FontAwesomeIcon icon={faPlus} className="mr-2" />
                        New Loan
                    </Link>
                </div>
            }
        >
            <Head title="Dashboard" />

            <div className="py-8">
                <div className="mx-auto max-w-7xl sm:px-6 lg:px-8 space-y-8">

                    {/* Top Row: Financial Snapshot (Hero Cards) */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <FinancialCard
                            title="Principal Amount"
                            value={formatCurrency(stats.total_amount)}
                            icon={faHandHoldingUsd}
                            gradient="bg-gradient-to-br from-indigo-600 to-indigo-800"
                            subText="Total borrowed capital"
                        />
                        <FinancialCard
                            title="Amount Paid"
                            value={formatCurrency(stats.paid_amount)}
                            icon={faMoneyBillWave}
                            gradient="bg-gradient-to-br from-emerald-500 to-emerald-700"
                            subText="Principal + Interest cleared"
                        />
                        <FinancialCard
                            title="Outstanding Due"
                            value={formatCurrency(stats.remaining_amount)}
                            icon={faCoins}
                            gradient="bg-gradient-to-br from-rose-500 to-rose-700"
                            subText="Remaining principal balance"
                        />
                    </div>

                    {/* Chart Section */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Repayment Progress Chart */}
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-700">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg text-emerald-600 dark:text-emerald-400">
                                    <FontAwesomeIcon icon={faChartLine} />
                                </div>
                                <h3 className="text-lg font-black text-gray-900 dark:text-white">Repayment Progress</h3>
                            </div>
                            <div className="h-64 flex items-center justify-center relative">
                                <Doughnut
                                    data={{
                                        labels: ['Paid', 'Remaining'],
                                        datasets: [{
                                            data: [stats.paid_amount, stats.remaining_amount],
                                            backgroundColor: ['#10B981', '#b91010ef'],
                                            borderWidth: 0,
                                            hoverOffset: 4
                                        }]
                                    }}
                                    options={{
                                        responsive: true,
                                        maintainAspectRatio: false,
                                        plugins: {
                                            legend: {
                                                position: 'bottom',
                                                labels: { usePointStyle: true, padding: 20 }
                                            }
                                        },
                                        cutout: '75%'
                                    }}
                                />
                                {/* Center Text */}
                                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                    <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">Paid</span>
                                    <span className="text-xl font-black text-gray-900 dark:text-white">
                                        {Math.round((stats.paid_amount / stats.total_amount) * 100) || 0}%
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Loan Distribution Chart */}
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-700">
                            <div className="flex items-center gap-3 mb-6">

                                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
                                    <FontAwesomeIcon icon={faList} />
                                </div>
                                <h3 className="text-lg font-black text-gray-900 dark:text-white">Portfolio Distribution</h3>
                            </div>
                            <div className="h-64 flex items-center justify-center relative">
                                <Doughnut
                                    data={{
                                        labels: ['Active', 'Closed', 'Overdue'],
                                        datasets: [{
                                            data: [stats.total_open_loan, stats.total_closed_loan, stats.total_overdue_loan],
                                            backgroundColor: ['#3B82F6', '#b91010ef', '#F59E0B'],
                                            borderWidth: 0,
                                            hoverOffset: 4
                                        }]
                                    }}
                                    options={{
                                        responsive: true,
                                        maintainAspectRatio: false,
                                        plugins: {
                                            legend: {
                                                position: 'bottom',
                                                labels: { usePointStyle: true, padding: 20 }
                                            }
                                        },
                                        cutout: '75%'
                                    }}
                                />
                                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                    <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">Total</span>
                                    <span className="text-xl font-black text-gray-900 dark:text-white">{stats.total_loan}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Monthly Trends Chart */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-700">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400">
                                <FontAwesomeIcon icon={faChartLine} />
                            </div>
                            <h3 className="text-lg font-black text-gray-900 dark:text-white">Monthly Payment History</h3>
                        </div>
                        <div className="h-80 w-full relative">
                            <Bar
                                data={{
                                    labels: Object.keys(stats.monthly_chart || {}),
                                    datasets: [{
                                        label: 'Amount Paid',
                                        data: Object.values(stats.monthly_chart || {}),
                                        backgroundColor: '#6366F1',
                                        borderRadius: 6,
                                        hoverBackgroundColor: '#4F46E5'
                                    }]
                                }}
                                options={{
                                    responsive: true,
                                    maintainAspectRatio: false,
                                    plugins: {
                                        legend: {
                                            display: false
                                        },
                                        tooltip: {
                                            backgroundColor: '#1F2937',
                                            padding: 12,
                                            titleFont: { size: 13 },
                                            bodyFont: { size: 14, weight: 'bold' },
                                            callbacks: {
                                                label: function (context) {
                                                    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(context.raw);
                                                }
                                            }
                                        }
                                    },
                                    scales: {
                                        y: {
                                            beginAtZero: true,
                                            grid: {
                                                display: true,
                                                color: 'rgba(0,0,0,0.05)'
                                            },
                                            ticks: {
                                                font: { size: 11 },
                                                callback: function (value) {
                                                    return new Intl.NumberFormat('en-IN', { notation: "compact", compactDisplay: "short" }).format(value);
                                                }
                                            }
                                        },
                                        x: {
                                            grid: {
                                                display: false
                                            },
                                            ticks: {
                                                font: { size: 11 }
                                            }
                                        }
                                    }
                                }}
                            />
                        </div>
                    </div>

                    {/* Middle Row: Detailed Breakdown */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                        {/* Left Column: Loan Portfolio */}
                        <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-xl border border-gray-100 dark:border-gray-700">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400">
                                    <FontAwesomeIcon icon={faWallet} />
                                </div>
                                <h3 className="text-lg font-black text-gray-900 dark:text-white">Loan Portfolio</h3>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <StatCard
                                    title="All Loans"
                                    value={stats.total_loan}
                                    icon={faList}
                                    colorClass="text-indigo-600 dark:text-indigo-400"
                                    bgClass="bg-indigo-50 dark:bg-indigo-900/20"
                                    subText="Total records"
                                />
                                <StatCard
                                    title="Active"
                                    value={stats.total_open_loan}
                                    icon={faCalendarCheck}
                                    colorClass="text-blue-600 dark:text-blue-400"
                                    bgClass="bg-blue-50 dark:bg-blue-900/20"
                                    subText="Ongoing loans"
                                />
                                <StatCard
                                    title="Closed"
                                    value={stats.total_closed_loan}
                                    icon={faCheckCircle}
                                    colorClass="text-emerald-600 dark:text-emerald-400"
                                    bgClass="bg-emerald-50 dark:bg-emerald-900/20"
                                    subText="Fully settled"
                                />
                                <StatCard
                                    title="Overdue"
                                    value={stats.total_overdue_loan}
                                    icon={faTimesCircle}
                                    colorClass="text-rose-600 dark:text-rose-400"
                                    bgClass="bg-rose-50 dark:bg-rose-900/20"
                                    subText="Attention needed"
                                />
                            </div>
                        </div>

                        {/* Right Column: EMI Schedule */}
                        <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-xl border border-gray-100 dark:border-gray-700">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg text-purple-600 dark:text-purple-400">
                                    <FontAwesomeIcon icon={faChartLine} />
                                </div>
                                <h3 className="text-lg font-black text-gray-900 dark:text-white">EMI Schedule</h3>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <StatCard
                                    title="Total EMIs"
                                    value={stats.total_emi}
                                    icon={faList}
                                    colorClass="text-purple-600 dark:text-purple-400"
                                    bgClass="bg-purple-50 dark:bg-purple-900/20"
                                    subText="Lifetime count"
                                />
                                <StatCard
                                    title="Paid"
                                    value={stats.paid_emi}
                                    icon={faFileInvoiceDollar}
                                    colorClass="text-emerald-600 dark:text-emerald-400"
                                    bgClass="bg-emerald-50 dark:bg-emerald-900/20"
                                    subText="Completed"
                                />
                                <StatCard
                                    title="Pending"
                                    value={stats.pending_emi}
                                    icon={faHourglassHalf}
                                    colorClass="text-amber-500 dark:text-amber-400"
                                    bgClass="bg-amber-50 dark:bg-amber-900/20"
                                    subText="Upcoming"
                                />
                                <StatCard
                                    title="Missed"
                                    value={stats.overdue_emi}
                                    icon={faTimesCircle}
                                    colorClass="text-red-500 dark:text-red-400"
                                    bgClass="bg-red-50 dark:bg-red-900/20"
                                    subText="Late payments"
                                />
                            </div>
                        </div>

                    </div>

                    {/* Bottom Row: Actions & Promo */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                        {/* Quick Action: Registry */}
                        <Link
                            href={route("loan-detail.index")}
                            className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-lg border border-gray-100 dark:border-gray-700 group hover:border-indigo-500 transition-all duration-300 flex flex-col justify-between h-full"
                        >
                            <div className="space-y-4">
                                <div className="p-3 bg-indigo-100 dark:bg-indigo-900/20 w-fit rounded-xl text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                    <FontAwesomeIcon icon={faList} className="text-xl" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">View Registry</h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Access and manage all your loan records.</p>
                                </div>
                            </div>
                            <div className="mt-4 flex items-center text-indigo-600 dark:text-indigo-400 font-bold text-sm">
                                Open List <span className="ml-2 group-hover:translate-x-1 transition-transform">→</span>
                            </div>
                        </Link>

                        {/* Quick Action: Profile */}
                        <Link
                            href={route("profile.edit")}
                            className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-lg border border-gray-100 dark:border-gray-700 group hover:border-purple-500 transition-all duration-300 flex flex-col justify-between h-full"
                        >
                            <div className="space-y-4">
                                <div className="p-3 bg-purple-100 dark:bg-purple-900/20 w-fit rounded-xl text-purple-600 dark:text-purple-400 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                                    <FontAwesomeIcon icon={faUser} className="text-xl" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">My Account</h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Update security settings and profile info.</p>
                                </div>
                            </div>
                            <div className="mt-4 flex items-center text-purple-600 dark:text-purple-400 font-bold text-sm">
                                Manage Profile <span className="ml-2 group-hover:translate-x-1 transition-transform">→</span>
                            </div>
                        </Link>

                        {/* Promo Banner */}
                        <div className="bg-gray-900 dark:bg-indigo-950 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden flex flex-col justify-center">
                            <div className="relative z-10 space-y-4">
                                <div>
                                    <h3 className="text-xl font-black">Stay on track.</h3>
                                    <p className="text-gray-400 text-sm mt-1">Don't miss a beat. Check your upcoming EMIs regularly.</p>
                                </div>
                                <Link
                                    href={route("loan-detail.index")}
                                    className="inline-block px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-xs uppercase tracking-wider transition-colors"
                                >
                                    Check Schedule
                                </Link>
                            </div>
                            {/* Decor */}
                            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/20 rounded-full blur-2xl -mr-10 -mt-10"></div>
                            <div className="absolute bottom-0 right-10 w-24 h-24 bg-purple-500/20 rounded-full blur-xl"></div>
                        </div>

                    </div>

                </div>
            </div>
        </AuthenticatedLayout>
    );
}
