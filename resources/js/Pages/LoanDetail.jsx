import AuthenticatedLayout from "@/Layouts/AuthenticatedLayout";
import { Button } from "@headlessui/react";
import { Head, Link } from "@inertiajs/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEdit, faEye, faTrash, faMoneyBillWave, faFileInvoiceDollar, faCheckCircle } from "@fortawesome/free-solid-svg-icons";

import DataTable from "datatables.net-react";
import DT from "datatables.net-dt";

DataTable.use(DT);

import React, { useRef, useEffect } from "react";
import axios from "axios";
import Swal from "sweetalert2";

export default function Dashboard({ loanDetails }) {
    const tableRef = useRef();

    // Calculate summaries if loanDetails is available
    const stats = React.useMemo(() => {
        // Handle both object with data property and array
        const list = Array.isArray(loanDetails) ? loanDetails : (loanDetails?.data || []);

        if (list.length === 0) return { active: 0, total: 0, pending: 0 };
        const activeLoans = list.filter(l => l.status !== 'closed').length;
        const totalAmount = list.reduce((sum, l) => sum + parseFloat(l.amount || 0), 0);
        const pendingEmis = list.reduce((sum, l) => {
            const paid = l.emi_details ? l.emi_details.filter(e => e.status == 'paid').length : 0;
            return sum + (parseInt(l.emi_count || 0) - paid);
        }, 0);

        return {
            active: activeLoans,
            total: totalAmount,
            pending: pendingEmis
        };
    }, [loanDetails]);

    const handlePayment = async () => {
        const amount = 5000; // replace with dynamic amount

        // 1. Create order on backend
        const res = await axios.post("/create-order", { amount });

        const { order_id, razorpay_key, currency } = res.data;

        // 2. Open Razorpay Checkout
        const options = {
            key: "rzp_test_2FVsQnHLJifMbi",
            amount: amount * 100,
            currency: currency,
            name: "Akk Technology",
            description: "Subscription charge for EMI Management!",
            order_id: order_id,
            handler: function (response) {
                console.log(response);
                axios.post("/verify-payment", {
                    razorpay_payment_id: response.razorpay_payment_id,
                    razorpay_order_id: response.razorpay_order_id,
                    razorpay_signature: response.razorpay_signature
                });
            },
            prefill: {
                name: "Akshay Kumar Karnwal",
                email: "karnwalakshay7@gmail.com",
                contact: "9568936879",
            },
            notes: {
                loan_id: "123456",
            },
            theme: {
                color: "#3399cc",
            },
        };

        const rzp = new window.Razorpay(options);
        rzp.open();
    };

    // DataTable configuration with AJAX
    const dataTableOptions = {
        selectAllRowsItem: true,
        selectAllRowsItemText: "ALL",
        processing: true,
        serverSide: true,
        ajax: {
            url: "/api/loan-detail", // Your AJAX endpoint
            type: "GET",
            data: function (d) {
                // You can add custom parameters here
                // d.custom_param = "value";
                return d;
            },
            error: function (xhr, error, code) {
                console.error('DataTable AJAX error:', error, code);
            }
        },
        columns: [
            {
                data: null,
                name: 'serial',
                orderable: false,
                searchable: false,
                className: 'px-4 py-3 text-center border-b border-gray-100 dark:border-gray-700',
                render: function (data, type, row, meta) {
                    return `<span class="text-xs font-medium text-gray-500">${meta.row + meta.settings._iDisplayStart + 1}</span>`;
                }
            },
            {
                data: 'provider',
                name: 'provider',
                className: 'px-4 py-3 font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-100 dark:border-gray-700'
            },
            {
                data: 'amount',
                name: 'amount',
                className: 'px-4 py-3 border-b border-gray-100 dark:border-gray-700',
                render: function (data) {
                    return `<span class="font-bold text-indigo-600 dark:text-indigo-400">₹${parseFloat(data).toLocaleString('en-IN')}</span>`;
                }
            },
            {
                data: 'processing_fee',
                name: 'processing_fee',
                className: 'px-4 py-3 border-b border-gray-100 dark:border-gray-700',
                render: function (data) {
                    return `<span class="text-gray-600 dark:text-gray-400">₹${parseFloat(data).toLocaleString('en-IN')}</span>`;
                }
            },
            {
                data: null,
                name: 'amount_you_get',
                orderable: false,
                className: 'px-4 py-3 border-b border-gray-100 dark:border-gray-700',
                render: function (data, type, row) {
                    const amountYouGet = parseFloat(row.amount) - parseFloat(row.processing_fee);
                    return `<span class="font-semibold text-green-600 dark:text-green-400">₹${amountYouGet.toLocaleString('en-IN')}</span>`;
                }
            },
            {
                data: 'interest_rate',
                name: 'interest_rate',
                className: 'px-4 py-3 text-center border-b border-gray-100 dark:border-gray-700',
                render: function (data) {
                    return `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">${data}%</span>`;
                }
            },
            {
                data: 'emi_count',
                name: 'emi_count',
                className: 'px-4 py-3 text-center border-b border-gray-100 dark:border-gray-700',
            },
            {
                data: 'paid_emi_count',
                name: 'paid_emi_count',
                orderable: false,
                className: 'px-4 py-3 text-center border-b border-gray-100 dark:border-gray-700',
                render: function (data, type, row) {
                    const paidEmi = row.emi_detail.filter(emi => emi.status === "paid").length;
                    const totalEmi = row.emi_count;
                    const percentage = (paidEmi / totalEmi) * 100;
                    return `
                        <div class="flex flex-col items-center min-w-[80px]">
                            <span class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">${paidEmi}/${totalEmi}</span>
                            <div class="w-full bg-gray-200 rounded-full h-1.5 dark:bg-gray-700">
                                <div class="bg-indigo-600 h-1.5 rounded-full" style="width: ${percentage}%"></div>
                            </div>
                        </div>
                    `;
                }
            },
            {
                data: 'status',
                name: 'status',
                className: 'px-4 py-3 border-b border-gray-100 dark:border-gray-700',
                render: function (data) {
                    const isClosed = data === 'closed';
                    const bgClass = isClosed ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
                    return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${bgClass}">${data.toUpperCase()}</span>`;
                }
            },
            {
                data: 'id',
                name: 'actions',
                orderable: false,
                searchable: false,
                className: 'px-4 py-3 border-b border-gray-100 dark:border-gray-700 text-right',
                render: function (data) {
                    return `
                        <div class="flex items-center justify-end space-x-1">
                             <a href="/loan-detail/${data}" 
                               class="p-2 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors"
                               title="View Detail">
                                <i class="fas fa-eye"></i>
                            </a>
                            <a href="/loan-detail/${data}/edit" 
                               class="p-2 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg transition-colors"
                               title="Edit Loan">
                                <i class="fas fa-edit"></i>
                            </a>
                            <button onclick="deleteLoan(${data})" 
                                    class="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                                    title="Delete Loan">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    `;
                }
            }
        ],
        pageLength: 10,
        lengthMenu: [[10, 25, 50, 100], [10, 25, 50, 100]],
        pagingType: "full_numbers",
        order: [[1, 'asc']], // Default sort by provider
        responsive: true,
        language: {
            processing: "Loading...",
            emptyTable: "No loan details available",
            info: "Showing _START_ to _END_ of _TOTAL_ entries",
            infoEmpty: "Showing 0 to 0 of 0 entries",
            infoFiltered: "(filtered from _MAX_ total entries)",
            lengthMenu: "Show _MENU_ entries",
            loadingRecords: "Loading...",
            // paginate: {
            //     first: "First",
            //     last: "Last",
            //     next: "Next",
            //     previous: "Previous"
            // },
            search: "Search:",
            zeroRecords: "No matching records found",
            paginate: {
                first: "«",
                last: "»",
                next: "›",
                previous: "‹"
            }
        },
        dom: '<"flex flex-col sm:flex-row justify-between items-center gap-4 mb-6"lf>rt<"flex flex-col sm:flex-row justify-between items-center gap-4 mt-6"ip>',
        className: "w-full"
    };


    // Delete function (make it global so it can be called from rendered HTML)
    useEffect(() => {
        // Custom CSS for DataTables pagination styling
        const addCustomStyles = () => {
            const style = document.createElement('style');
            style.textContent = `
                /* DataTables Search and Length Styling */
                .dataTables_wrapper .dataTables_length, 
                .dataTables_wrapper .dataTables_filter,
                .dt-length, .dt-search {
                    margin-bottom: 1.5rem !important;
                    display: flex !important;
                    align-items: center !important;
                    gap: 0.5rem !important;
                }

                /* Label color for Length Menu and Search text */
                .dataTables_length label, .dt-length label {
                    color: #6b7280 !important; /* indigo-600 */
                    font-weight: 600 !important;
                }

                .dark .dataTables_length label, .dark .dt-length label {
                    color: #6b7280 !important; /* indigo-300 */
                }

                .dataTables_filter label, .dt-search label {
                    color: #6b7280 !important; /* indigo-600 */
                    font-weight: 600 !important;
                }

                .dark .dataTables_filter label, .dark .dt-search label {
                    color: #6b7280 !important; /* indigo-300 */
                }
                
                .dataTables_filter input, .dt-search input {
                    border: 1px solid #e5e7eb !important;
                    border-radius: 0.75rem !important;
                    padding: 0.5rem 1rem !important;
                    outline: none !important;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
                    background: #f9fafb !important;
                    font-size: 0.875rem !important;
                    min-width: 250px !important;
                }

                .dark .dataTables_filter input, .dark .dt-search input {
                    background: #1f2937 !important;
                    border-color: #374151 !important;
                    color: #f9fafb !important;
                }

                .dataTables_filter input:focus, .dt-search input:focus {
                    border-color: #4f46e5 !important;
                    background: white !important;
                    box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.1) !important;
                    transform: translateY(-1px) !important;
                }

                .dark .dataTables_filter input:focus, .dark .dt-search input:focus {
                    background: #111827 !important;
                    box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.2) !important;
                }
                
                .dataTables_length select, .dt-length select {
                    border: 1px solid #e5e7eb !important;
                    border-radius: 0.75rem !important;
                    padding: 0.5rem 2.5rem 0.5rem 1rem !important;
                    background-color: #f9fafb !important;
                    font-size: 0.875rem !important;
                    cursor: pointer !important;
                    appearance: none !important;
                    background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='Step Id: 6 10l4 4 4-4'/%3e%3c/svg%3e") !important;
                    background-position: right 0.5rem center !important;
                    background-repeat: no-repeat !important;
                    background-size: 1.5em 1.5em !important;
                    transition: all 0.2s !important;
                }

                .dark .dataTables_length select, .dark .dt-length select {
                    background-color: #1f2937 !important;
                    border-color: #374151 !important;
                    color: #f9fafb !important;
                    background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%239ca3af' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='Step Id: 6 10l4 4 4-4'/%3e%3c/svg%3e") !important;
                }

                .dataTables_length select:focus, .dt-length select:focus {
                    border-color: #4f46e5 !important;
                    box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.1) !important;
                }

                /* Table Hover Effects */
                table.dataTable tbody tr:hover {
                    background-color: rgba(79, 70, 229, 0.02) !important;
                }

                .dark table.dataTable tbody tr:hover {
                    background-color: rgba(255, 255, 255, 0.02) !important;
                }

                /* Pagination Styling - Supporting both DataTables 1.x and 2.x */
                .dataTables_paginate, .dt-paging {
                    padding-top: 1.5rem !important;
                    display: flex !important;
                    justify-content: flex-end !important;
                    flex-wrap: wrap !important;
                    gap: 0.5rem !important;
                }

                .dataTables_paginate .paginate_button, .dt-paging .dt-paging-button {
                    padding: 0.5rem 1rem !important;
                    border: 1px solid #4f46e5 !important;
                    border-radius: 0.75rem !important;
                    cursor: pointer !important;
                    transition: all 0.2s ease-in-out !important;
                    background: white !important;
                    color: #4f46e5 !important;
                    font-weight: 600 !important;
                    font-size: 0.875rem !important;
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    min-width: 40px !important;
                    text-decoration: none !important;
                    margin: 0 !important; /* Reset default margins */
                    box-sizing: border-box !important;
                }

                /* Ensure specific gap and margin for stability */
                .dataTables_paginate .paginate_button:not(:last-child), 
                .dt-paging .dt-paging-button:not(:last-child) {
                    margin-right: 2px !important;
                }

                .dark .dataTables_paginate .paginate_button, .dark .dt-paging .dt-paging-button {
                    background: #1f2937 !important;
                    border-color: #6366f1 !important;
                    color: #a5b4fc !important;
                }

                .dataTables_paginate .paginate_button:hover:not(.current):not(.disabled), 
                .dt-paging .dt-paging-button:hover:not(.current):not(.disabled) {
                    background: #eef2ff !important;
                    border-color: #4338ca !important;
                    color: #4338ca !important;
                    transform: translateY(-1px) !important;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1) !important;
                }

                .dark .dataTables_paginate .paginate_button:hover:not(.current):not(.disabled),
                .dark .dt-paging .dt-paging-button:hover:not(.current):not(.disabled) {
                    background: #312e81 !important;
                    border-color: #818cf8 !important;
                    color: white !important;
                }

                .dataTables_paginate .paginate_button.current, 
                .dt-paging .dt-paging-button.current {
                    background: #4f46e5 !important;
                    border-color: #4f46e5 !important;
                    color: white !important;
                    box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4) !important;
                }

                .dataTables_paginate .paginate_button.disabled, 
                .dt-paging .dt-paging-button.disabled {
                    cursor: not-allowed !important;
                    opacity: 0.4 !important;
                    background: #f3f4f6 !important;
                    color: #9ca3af !important;
                    border-color: #e5e7eb !important;
                    transform: none !important;
                    box-shadow: none !important;
                }

                .dark .dataTables_paginate .paginate_button.disabled,
                .dark .dt-paging .dt-paging-button.disabled {
                    background: #374151 !important;
                    border-color: #4b5563 !important;
                    color: #6b7280 !important;
                }

                .dataTables_info, .dt-info {
                    padding-top: 1.5rem !important;
                    color: #6b7280 !important;
                    font-size: 0.875rem !important;
                    font-weight: 500 !important;
                }

                .dark .dataTables_info, .dark .dt-info {
                    color: #9ca3af !important;
                }
            `;
            document.head.appendChild(style);
        };

        addCustomStyles();

        window.deleteLoan = async (loanId) => {
            if (!loanId) {
                console.error("deleteLoan called with invalid ID:", loanId);
                Swal.fire('Error', 'Invalid Loan ID encountered.', 'error');
                return;
            }

            const result = await Swal.fire({
                title: 'Are you sure?',
                text: "You won't be able to revert this!",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#4f46e5',
                cancelButtonColor: '#ef4444',
                confirmButtonText: 'Yes, delete it!',
                cancelButtonText: 'Cancel',
                background: document.documentElement.classList.contains('dark') ? '#1f2937' : '#ffffff',
                color: document.documentElement.classList.contains('dark') ? '#f3f4f6' : '#1f2937',
                borderRadius: '1rem',
                customClass: {
                    popup: 'rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-700',
                    confirmButton: 'rounded-xl px-6 py-2.5 font-bold uppercase tracking-widest text-sm transition-all duration-200 hover:scale-105 active:scale-95',
                    cancelButton: 'rounded-xl px-6 py-2.5 font-bold uppercase tracking-widest text-sm transition-all duration-200 hover:scale-105 active:scale-95'
                }
            });

            if (result.isConfirmed) {
                try {
                    await axios.delete(`/loan-detail/${loanId}`, {
                        headers: {
                            'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content')
                        }
                    });

                    // Reload the DataTable
                    if (tableRef.current) {
                        tableRef.current.dt().ajax.reload();
                    }

                    // Show success message
                    Swal.fire({
                        title: 'Deleted!',
                        text: 'Loan has been deleted successfully.',
                        icon: 'success',
                        confirmButtonColor: '#4f46e5',
                        background: document.documentElement.classList.contains('dark') ? '#1f2937' : '#ffffff',
                        color: document.documentElement.classList.contains('dark') ? '#f3f4f6' : '#1f2937',
                        borderRadius: '1rem',
                        customClass: {
                            popup: 'rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-700',
                            confirmButton: 'rounded-xl px-6 py-2.5 font-bold uppercase tracking-widest text-sm transition-all duration-200 hover:scale-105 active:scale-95'
                        }
                    });
                } catch (error) {
                    console.error('Error deleting loan:', error);
                    Swal.fire({
                        title: 'Error!',
                        text: 'Error deleting loan. Please try again.',
                        icon: 'error',
                        confirmButtonColor: '#4f46e5',
                        background: document.documentElement.classList.contains('dark') ? '#1f2937' : '#ffffff',
                        color: document.documentElement.classList.contains('dark') ? '#f3f4f6' : '#1f2937',
                        borderRadius: '1rem',
                        customClass: {
                            popup: 'rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-700',
                            confirmButton: 'rounded-xl px-6 py-2.5 font-bold uppercase tracking-widest text-sm transition-all duration-200 hover:scale-105 active:scale-95'
                        }
                    });
                }
            }
        };

        // Load Razorpay script
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.async = true;
        document.body.appendChild(script);

        // Cleanup
        return () => {
            delete window.deleteLoan;
        };
    }, []);

    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div>
                        <h2 className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400 leading-tight">
                            Loan Management
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Track and manage your loan disbursements and EMIs</p>
                    </div>

                    <div className="flex items-center space-x-3 w-full sm:w-auto">
                        <button
                            onClick={handlePayment}
                            className="flex-1 sm:flex-none inline-flex items-center justify-center px-6 py-2.5 rounded-xl border border-transparent bg-indigo-600 text-sm font-bold uppercase tracking-widest text-white shadow-lg shadow-indigo-200 dark:shadow-indigo-900/20 transition-all duration-200 hover:bg-indigo-700 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                        >
                            <span className="mr-2">⚡</span> Pay Now
                        </button>

                        <Link
                            href={route("loan-detail.create")}
                            className="flex-1 sm:flex-none inline-flex items-center justify-center px-6 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-bold uppercase tracking-widest text-gray-700 dark:text-gray-200 shadow-sm transition-all duration-200 hover:bg-gray-50 dark:hover:bg-gray-700 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 focus:outline-none focus:ring-2 focus:ring-gray-300"
                        >
                            <span className="mr-2">+</span> Add Loan
                        </Link>
                    </div>
                </div>
            }
        >
            <Head title="Dashboard" />

            <div className="py-8">
                <div className="mx-auto max-w-7xl sm:px-6 lg:px-8">
                    {/* Summary Cards */}
                    {/* <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <div className="bg-white dark:bg-gray-800 overflow-hidden shadow-sm sm:rounded-2xl p-6 border border-gray-100 dark:border-gray-700">
                            <div className="flex items-center">
                                <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400">
                                    <FontAwesomeIcon icon={faCheckCircle} className="w-6 h-6" />
                                </div>
                                <div className="ml-4">
                                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Active Loans</p>
                                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{stats.active}</h3>
                                </div>
                            </div>
                        </div>
                        <div className="bg-white dark:bg-gray-800 overflow-hidden shadow-sm sm:rounded-2xl p-6 border border-gray-100 dark:border-gray-700">
                            <div className="flex items-center">
                                <div className="p-3 rounded-xl bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400">
                                    <FontAwesomeIcon icon={faMoneyBillWave} className="w-6 h-6" />
                                </div>
                                <div className="ml-4">
                                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Amount</p>
                                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white">₹{stats.total.toLocaleString()}</h3>
                                </div>
                            </div>
                        </div>
                        <div className="bg-white dark:bg-gray-800 overflow-hidden shadow-sm sm:rounded-2xl p-6 border border-gray-100 dark:border-gray-700">
                            <div className="flex items-center">
                                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400">
                                    <FontAwesomeIcon icon={faFileInvoiceDollar} className="w-6 h-6" />
                                </div>
                                <div className="ml-4">
                                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Pending EMIs</p>
                                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{stats.pending}</h3>
                                </div>
                            </div>
                        </div>
                    </div> */}

                    <div className="bg-white dark:bg-gray-800 overflow-hidden shadow-xl sm:rounded-2xl border border-gray-100 dark:border-gray-700">
                        <div className="p-8">
                            <DataTable
                                ref={tableRef}
                                options={dataTableOptions}
                                className="w-full text-sm text-left text-gray-500 dark:text-gray-400"
                            >
                                <thead className="text-xs text-gray-400 uppercase bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                                    <tr>
                                        <th className="px-4 py-4 font-bold tracking-wider">#</th>
                                        <th className="px-4 py-4 font-bold tracking-wider">Provider</th>
                                        <th className="px-4 py-4 font-bold tracking-wider">Amount</th>
                                        <th className="px-4 py-4 font-bold tracking-wider">Pros. Fee</th>
                                        <th className="px-4 py-4 font-bold tracking-wider">Payout</th>
                                        <th className="px-4 py-4 font-bold tracking-wider">Interest</th>
                                        <th className="px-4 py-4 font-bold tracking-wider">EMIs</th>
                                        <th className="px-4 py-4 font-bold tracking-wider">Progress</th>
                                        <th className="px-4 py-4 font-bold tracking-wider">Status</th>
                                        <th className="px-4 py-4 font-bold tracking-wider text-right">Actions</th>
                                    </tr>
                                </thead>
                            </DataTable>
                        </div>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}