import AuthenticatedLayout from "@/Layouts/AuthenticatedLayout";
import { Head, Link } from "@inertiajs/react";
import Checkbox from "@/Components/Checkbox";
import axios from "axios";
import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faArrowLeft,
    faCalendarAlt,
    faMoneyBillWave,
    faPercentage,
    faUniversity,
    faClock,
    faInfoCircle,
    faCheckCircle,
    faExclamationCircle,
    faUser,
    faDownload,
} from "@fortawesome/free-solid-svg-icons";

import DataTable from "datatables.net-react";
import DT from "datatables.net-dt";
import React, { useRef, useEffect } from "react";

DataTable.use(DT);

export default function Show({ mustVerifyEmail, user, loanDetail, emiDetail, documents }) {
    const tableRef = useRef();
    const [localEmiDetails, setLocalEmiDetails] = useState(emiDetail);

    const changeStatus = (id, checked) => {
        const newStatus = checked ? "paid" : "pending";
        const emiId = id;

        axios.put(route("emi-detail.update", loanDetail.id), {
            id: emiId,
            status: newStatus,
        })
            .then((response) => {
                setLocalEmiDetails((prevDetails) =>
                    prevDetails.map((emi) =>
                        emi.id === parseInt(emiId)
                            ? { ...emi, status: newStatus }
                            : emi
                    )
                );
            })
            .catch((error) => {
                console.error("Error updating status:", error);
            });
    };

    // Make changeStatus available globally for DataTable render
    useEffect(() => {
        window.changeEmiStatus = (element) => {
            changeStatus(element.value, element.checked);
        };

        const addCustomStyles = () => {
            if (document.getElementById('datatable-custom-styles')) return;
            const style = document.createElement('style');
            style.id = 'datatable-custom-styles';
            style.textContent = `
                .dataTables_wrapper .dataTables_length, 
                .dataTables_wrapper .dataTables_filter,
                .dt-length, .dt-search {
                    margin-bottom: 1.5rem !important;
                    display: flex !important;
                    align-items: center !important;
                    gap: 0.5rem !important;
                }
                
                .dataTables_filter input, .dt-search input {
                    border: 1px solid #e5e7eb !important;
                    border-radius: 0.75rem !important;
                    padding: 0.5rem 1rem !important;
                    outline: none !important;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
                    background: #f9fafb !important;
                    font-size: 0.875rem !important;
                    min-width: 200px !important;
                }

                .dark .dataTables_filter input, .dark .dt-search input {
                    background: #1f2937 !important;
                    border-color: #374151 !important;
                    color: #f9fafb !important;
                }

                .dataTables_length select, .dt-length select {
                    border: 1px solid #e5e7eb !important;
                    border-radius: 0.75rem !important;
                    padding: 0.5rem 2.5rem 0.5rem 1rem !important;
                    background-color: #f9fafb !important;
                    font-size: 0.875rem !important;
                    cursor: pointer !important;
                }

                .dark .dataTables_length select, .dark .dt-length select {
                    background-color: #1f2937 !important;
                    border-color: #374151 !important;
                    color: #f9fafb !important;
                }

                .dataTables_paginate, .dt-paging {
                    padding-top: 1.5rem !important;
                    display: flex !important;
                    justify-content: flex-end !important;
                    flex-wrap: wrap !important;
                    gap: 0.75rem !important;
                }

                .dataTables_paginate .paginate_button, .dt-paging .dt-paging-button {
                    padding: 0.5rem 1rem !important;
                    border: 1px solid #4f46e5 !important;
                    border-radius: 0.75rem !important;
                    cursor: pointer !important;
                    background: white !important;
                    color: #4f46e5 !important;
                    font-weight: 600 !important;
                    font-size: 0.875rem !important;
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    min-width: 40px !important;
                    text-decoration: none !important;
                    margin: 2px !important;
                    transition: all 0.2s ease !important;
                }

                .dark .dataTables_paginate .paginate_button, .dark .dt-paging .dt-paging-button {
                    background: #1f2937 !important;
                    border-color: #6366f1 !important;
                    color: #a5b4fc !important;
                }

                .dataTables_paginate .paginate_button.current, .dt-paging .dt-paging-button.current {
                    background: #4f46e5 !important;
                    border-color: #4f46e5 !important;
                    color: white !important;
                }

                .dataTables_paginate .paginate_button.disabled, .dt-paging .dt-paging-button.disabled {
                    cursor: not-allowed !important;
                    opacity: 0.4 !important;
                }
            `;
            document.head.appendChild(style);
        };

        addCustomStyles();

        return () => {
            delete window.changeEmiStatus;
        };
    }, [localEmiDetails]);

    const dataTableOptions = {
        data: localEmiDetails,
        columns: [
            {
                data: null,
                render: (data, type, row, meta) => `<span class="font-bold text-gray-400">${meta.row + 1}.</span>`,
                className: "px-6 py-4"
            },
            {
                data: 'due_date',
                render: (data) => new Date(data).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
                className: "px-6 py-4 text-gray-900 dark:text-gray-200 font-medium"
            },
            {
                data: 'amount',
                render: (data) => `₹${parseFloat(data).toLocaleString()}`,
                className: "px-6 py-4 text-right font-black text-gray-700 dark:text-gray-300"
            },
            {
                data: 'status',
                render: (data) => {
                    const isPaid = data === 'paid';
                    const colorClass = isPaid
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
                    const icon = isPaid ? 'fa-check-circle' : 'fa-exclamation-circle';
                    return `
                        <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-tighter ${colorClass}">
                            <i class="fas ${icon} mr-1"></i>
                            ${data}
                        </span>
                    `;
                },
                className: "px-6 py-4 text-center"
            },
            {
                data: null,
                orderable: false,
                render: (data, type, row) => `
                    <div class="flex items-center justify-center">
                        <input type="checkbox" 
                               value="${row.id}" 
                               ${row.status === 'paid' ? 'checked' : ''} 
                               onchange="changeEmiStatus(this)"
                               class="w-5 h-5 text-indigo-600 border-gray-300 rounded-lg focus:ring-indigo-500 dark:bg-gray-900 dark:border-gray-600 transition-all cursor-pointer" />
                    </div>
                `,
                className: "px-6 py-4 text-center"
            }
        ],
        pageLength: 5,
        responsive: true,
        dom: '<"flex justify-between items-center mb-4"lf>rt<"flex justify-between items-center mt-4"ip>',
        language: {
            search: "Search:",
            lengthMenu: "Show _MENU_",
            info: "Showing _START_ to _END_ of _TOTAL_",
            paginate: {
                first: "«",
                last: "»",
                next: "›",
                previous: "‹"
            }
        }
    };
    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div>
                        <h2 className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400 leading-tight">
                            Loan Details
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Viewing details for {loanDetail.provider} loan
                        </p>
                    </div>

                    <Link
                        href={route("loan-detail.index")}
                        className="inline-flex items-center px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-bold text-gray-700 dark:text-gray-200 shadow-sm transition-all duration-200 hover:bg-gray-50 dark:hover:bg-gray-700 hover:-translate-y-0.5"
                    >
                        <FontAwesomeIcon icon={faArrowLeft} className="mr-2" />
                        Back to Dashboard
                    </Link>
                </div>
            }
        >
            <Head title="Loan Detail" />

            <div className="py-8">
                <div className="mx-auto max-w-7xl sm:px-6 lg:px-8 space-y-8">
                    {/* Loan Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {/* Status Card */}
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-3 opacity-10">
                                <FontAwesomeIcon icon={faInfoCircle} size="3x" className="text-indigo-600" />
                            </div>
                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Current Status</h4>
                            <div className="flex items-center gap-2">
                                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${loanDetail.status === 'active'
                                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                    : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                                    }`}>
                                    {loanDetail.status}
                                </span>
                            </div>
                            <p className="text-sm text-gray-500 mt-4 flex items-center">
                                <FontAwesomeIcon icon={faUser} className="mr-2 text-indigo-400" />
                                {user.name}
                            </p>
                        </div>

                        {/* Principal Card */}
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Total Loan Amount</h4>
                            <p className="text-2xl font-black text-gray-900 dark:text-white">
                                ₹{parseFloat(loanDetail.amount).toLocaleString()}
                            </p>
                            <p className="text-xs text-gray-500 mt-2 flex items-center">
                                <FontAwesomeIcon icon={faMoneyBillWave} className="mr-1 text-green-500" />
                                Principal Amount
                            </p>
                        </div>

                        {/* EMI Card */}
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Monthly EMI</h4>
                            <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
                                ₹{parseFloat(loanDetail.emi_amount).toLocaleString()}
                            </p>
                            <p className="text-xs text-gray-500 mt-2 flex items-center">
                                <FontAwesomeIcon icon={faClock} className="mr-1 text-indigo-400" />
                                Duration: {loanDetail.emi_count} Months
                            </p>
                        </div>

                        {/* Cost Card */}
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Interest Rate</h4>
                            <p className="text-2xl font-black text-gray-900 dark:text-white">
                                {loanDetail.interest_rate}%
                            </p>
                            <p className="text-xs text-gray-500 mt-2 flex items-center">
                                <FontAwesomeIcon icon={faPercentage} className="mr-1 text-purple-400" />
                                Annual Percentage Rate
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-8">
                        {/* Full Details Table (Sidebar Style) */}
                        <div className="space-y-6">
                            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                                <div className="p-5 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
                                    <h3 className="font-bold text-gray-900 dark:text-white flex items-center">
                                        <FontAwesomeIcon icon={faUniversity} className="mr-2 text-indigo-500" />
                                        Loan Particulars
                                    </h3>
                                </div>
                                <div className="p-5 space-y-4">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-gray-500">Provider</span>
                                        <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{loanDetail.provider}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-gray-500">Disbursed Date</span>
                                        <span className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center">
                                            <FontAwesomeIcon icon={faCalendarAlt} className="mr-2 text-gray-400" />
                                            {new Date(loanDetail.disbursed_date).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-gray-500">Processing Fee</span>
                                        <span className="text-sm font-bold text-gray-900 dark:text-gray-100">₹{parseFloat(loanDetail.processing_fee).toLocaleString()}</span>
                                    </div>
                                    <div className="pt-4 mt-4 border-t border-gray-100 dark:border-gray-700">
                                        <div className="flex justify-between items-center bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-xl">
                                            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase">Total EMIs Paid</span>
                                            <span className="text-lg font-black text-indigo-700 dark:text-indigo-300">
                                                {localEmiDetails.filter(e => e.status === 'paid').length} / {loanDetail.emi_count}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Documents Section */}
                        <div>
                            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                                <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                                    <h3 className="font-bold text-gray-900 dark:text-white">Documents</h3>
                                </div>
                                <div className="p-5">
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {documents.map((doc) => (
                                            <div key={doc.id} className="bg-gray-50 dark:bg-gray-700 p-4 rounded-xl border border-gray-100 dark:border-gray-600">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm font-bold text-gray-900 dark:text-white">{doc.document}</span>
                                                    <a href={`/storage/${doc.path}`} target="_blank" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200">
                                                        <FontAwesomeIcon icon={faDownload} />
                                                    </a>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Payment Schedule Table */}
                        <div>
                            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                                <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                                    <h3 className="font-bold text-gray-900 dark:text-white">Repayment Schedule</h3>
                                    <span className="text-xs text-gray-500 font-medium">Auto-calculated based on disbursement</span>
                                </div>
                                <div className="p-6 overflow-hidden">
                                    <DataTable
                                        ref={tableRef}
                                        options={dataTableOptions}
                                        className="w-full text-sm text-left"
                                    >
                                        <thead>
                                            <tr className="bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400">
                                                <th className="px-6 py-4 font-bold uppercase text-xs tracking-wider">No.</th>
                                                <th className="px-6 py-4 font-bold uppercase text-xs tracking-wider">Due Date</th>
                                                <th className="px-6 py-4 font-bold uppercase text-xs tracking-wider text-right">EMI Amount</th>
                                                <th className="px-6 py-4 font-bold uppercase text-xs tracking-wider text-center">Status</th>
                                                <th className="px-6 py-4 font-bold uppercase text-xs tracking-wider text-center">Action</th>
                                            </tr>
                                        </thead>
                                    </DataTable>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
