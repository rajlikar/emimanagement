import AuthenticatedLayout from "@/Layouts/AuthenticatedLayout";
import { Head, useForm, Link } from "@inertiajs/react";
import InputError from "@/Components/InputError";
import InputLabel from "@/Components/InputLabel";
import TextInput from "@/Components/TextInput";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faArrowLeft,
    faSave,
    faCalendarAlt,
    faPercentage,
    faMoneyBillWave,
    faUniversity,
    faBan,
    faCheckCircle,
    faHistory,
    faEdit,
    faPlus,
    faMinus,
    faTrash,
    faFileAlt,
    faDownload,
    faUpload,
    faTimes
} from "@fortawesome/free-solid-svg-icons";
import { router } from '@inertiajs/react';
import { useState, useEffect } from "react";

export default function Edit({ mustVerifyEmail, loanDetail, emiDetail, documents }) {
    const { data, setData, post, errors, reset } = useForm({
        provider: loanDetail.provider,
        amount: loanDetail.amount,
        processing_fee: loanDetail.processing_fee,
        interest_rate: loanDetail.interest_rate,
        tenure: loanDetail.emi_count,
        emi_amount: loanDetail.emi_amount,
        loan_type: loanDetail.loan_type,
        date: loanDetail.disbursed_date,
        documents: [],
        _method: "PUT",
    });

    // const [loan_type, setLoanType] = useState("tenure");

    // const handleLoanTypeChange = (e) => {
    //     const selectedType = e.target.value;

    //     // Use functional form of setData to ensure consistent updates
    //     setData((prevData) => ({
    //         ...prevData,
    //         loan_type: selectedType,
    //         emi_amount: "", // Reset EMI amount
    //         tenure: "", // Reset Number of EMIs
    //     }));
    // };

    const [emiDetails, setEmiDetail] = useState(emiDetail);
    const handleInputChange = (index, field, value) => {
        const updatedEmiDetail = [...emiDetails];
        updatedEmiDetail[index][field] = value;
        setEmiDetail(updatedEmiDetail);
    };

    const { data: docData, setData: setDocData, post: postDoc, processing: docProcessing, errors: docErrors, reset: resetDoc } = useForm({
        documents: [],
    });

    const addDocument = () => {
        setDocData("documents", [...docData.documents, { name: "", file: null }]);
    };

    const removeDocument = (index) => {
        const newDocs = [...docData.documents];
        newDocs.splice(index, 1);
        setDocData("documents", newDocs);
    };

    const handleDocumentChange = (index, field, value) => {
        const newDocs = [...docData.documents];
        newDocs[index][field] = value;
        setDocData("documents", newDocs);
    };

    const handleDocSubmit = (e) => {
        e.preventDefault();
        const docSuccessMessage = document.getElementById("docSuccessMessage");

        postDoc(route('loan-document.upload', loanDetail.id), {
            forceFormData: true,
            onSuccess: () => {
                resetDoc();
                if (docSuccessMessage) {
                    docSuccessMessage.innerHTML = "Documents uploaded successfully!";
                    docSuccessMessage.className = "text-green-600 font-semibold mt-2";
                    setTimeout(() => {
                        docSuccessMessage.innerHTML = "";
                        docSuccessMessage.className = "";
                    }, 5000);
                }
            },
            onError: () => {
                if (docSuccessMessage) {
                    docSuccessMessage.innerHTML = "Failed to upload documents.";
                    docSuccessMessage.className = "text-red-600 font-semibold mt-2";
                    setTimeout(() => {
                        docSuccessMessage.innerHTML = "";
                        docSuccessMessage.className = "";
                    }, 5000);
                }
            }
        });
    };

    const handleDeleteDocument = (docId) => {
        if (confirm('Are you sure you want to delete this document?')) {
            router.delete(route('loan-document.destroy', docId), {
                preserveScroll: true,
                onSuccess: () => {
                    // Start success message animation/logic if needed, though inertia preserves scroll
                }
            });
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        // Get the span element
        const loanUpdateSuccessMessage =
            document.getElementById("loanUpdateSuccess");
        post(route("loan-detail.update", loanDetail.id), {
            onSuccess: () => {
                // Update the span with success message and classes
                loanUpdateSuccessMessage.innerHTML =
                    "Loan details updated successfully!";
                loanUpdateSuccessMessage.className =
                    "text-green-600 font-semibold mt-2";

                // Reset New Documents form is handled in its own form now

                // Remove the message after 5 seconds
                setTimeout(() => {
                    loanUpdateSuccessMessage.innerHTML = "";
                    loanUpdateSuccessMessage.className = "";
                }, 5000);
            },
            onError: (errors) => {
                loanUpdateSuccessMessage.innerHTML =
                    "An error occurred while updating EMI details.";
                loanUpdateSuccessMessage.className =
                    "text-red-600 font-semibold mt-2";

                // Remove the error message after 5 seconds (optional)
                setTimeout(() => {
                    loanUpdateSuccessMessage.innerHTML = "";
                    loanUpdateSuccessMessage.className = "";
                }, 5000);
            },
            onFinish: () => {
                console.log("Request completed.");
            },
        });
    };

    // Handle form submission
    const handleEmiSubmit = async (e) => {
        e.preventDefault();
        // Get the loan_detail_id from the form
        const loanDetailId = document.getElementById("loan_detail_id").value;
        // Get the span element
        const successMessageSpan = document.getElementById("successMessage");

        // Include loan_detail_id in the payload
        const payload = {
            loan_detail_id: loanDetailId,
            emi_details: emiDetail, // Existing EMI details array
        };
        try {
            const csrfToken = document
                .querySelector('meta[name="csrf-token"]')
                ?.getAttribute("content");
            const response = await fetch("/update-emi", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-TOKEN": csrfToken,
                },
                body: JSON.stringify(payload),
            });
            const result = await response.json();
            if (result.status === true) {
                setEmiDetail(result.updatedEmi);
                // Update the span with success message and classes
                successMessageSpan.innerHTML =
                    "EMI details updated successfully!";
                successMessageSpan.className =
                    "text-green-600 font-semibold mt-2";

                // Remove the message after 5 seconds
                setTimeout(() => {
                    successMessageSpan.innerHTML = "";
                    successMessageSpan.className = "";
                }, 5000);
            } else {
                throw new Error(
                    result.message || "Failed to update EMI details."
                );
            }
        } catch (error) {
            console.error("Error:", error);
            successMessageSpan.innerHTML =
                "An error occurred while updating EMI details.";
            successMessageSpan.className = "text-red-600 font-semibold mt-2";

            // Remove the error message after 5 seconds (optional)
            setTimeout(() => {
                successMessageSpan.innerHTML = "";
                successMessageSpan.className = "";
            }, 5000);
        }
    };

    // Handle foreclose loan
    const foreCloseLoan = async (loanId, event) => {
        event.preventDefault(); // Prevent default form submission
        const csrfToken = document
            .querySelector('meta[name="csrf-token"]')
            ?.getAttribute("content");
        const response = await fetch(`/foreclose-loan`, {
            method: "POST",
            body: JSON.stringify({ loan_id: loanId }),
            headers: {
                "Content-Type": "application/json",
                "X-CSRF-TOKEN": csrfToken,
            },
        });
        const result = await response.json();
        if (result.status === true) {
            // Update the span with success message and classes
            const successMessageSpan =
                document.getElementById("successMessage");
            successMessageSpan.innerHTML = "Loan foreclosed successfully!";
            successMessageSpan.className = "text-green-600 font-semibold mt-2";

            // Remove the message after 5 seconds
            setTimeout(() => {
                successMessageSpan.innerHTML = "";
                successMessageSpan.className = "";
                window.location = "/loan-detail";
            }, 5000);
        } else {
            console.error("Error:", result.message);
        }
    };

    // Handle Emi skip
    const handleEmiSkip = async (loanId, emiId, event) => {
        event.preventDefault();
        const csrfToken = document
            .querySelector('meta[name="csrf-token"]')
            ?.getAttribute("content");
        const response = await fetch(`/emi-skipped`, {
            method: "POST",
            body: JSON.stringify({ emi_id: emiId, loan_id: loanId }),
            headers: {
                "Content-Type": "application/json",
                "X-CSRF-TOKEN": csrfToken,
            },
        });
        const result = await response.json();
        if (result.status === true) {
            // Update the span with success message and classes
            const successMessageSpan =
                document.getElementById("successMessage");
            successMessageSpan.innerHTML = "Emi details updated successfully!";
            successMessageSpan.className = "text-green-600 font-semibold mt-2";

            // Remove the message after 5 seconds
            setTimeout(() => {
                successMessageSpan.innerHTML = "";
                successMessageSpan.className = "";
                location.reload();
            }, 5000);
        } else {
            console.error("Error:", result.message);
        }
    };
    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 text-center sm:text-left">
                    <div>
                        <h2 className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400 leading-tight">
                            Edit Loan Details
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Update parameters and adjust EMI schedule for {loanDetail.provider}</p>
                    </div>

                    <div className="flex items-center gap-3">
                        <Link
                            href={route("loan-detail.index")}
                            className="inline-flex items-center px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-bold text-gray-700 dark:text-gray-200 shadow-sm transition-all duration-200 hover:bg-gray-50 dark:hover:bg-gray-700 hover:-translate-y-0.5"
                        >
                            <FontAwesomeIcon icon={faArrowLeft} className="mr-2" />
                            Back to List
                        </Link>

                        <button
                            type="button"
                            onClick={(e) => foreCloseLoan(loanDetail.id, e)}
                            className="inline-flex items-center px-4 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-800 text-sm font-bold uppercase tracking-wider transition-all hover:bg-red-100 dark:hover:bg-red-900/40 hover:-translate-y-0.5"
                        >
                            <FontAwesomeIcon icon={faBan} className="mr-2" />
                            Foreclose Loan
                        </button>
                    </div>
                </div>
            }
        >
            <Head title="Loan Detail" />
            <div className="py-8">
                <div className="mx-auto max-w-7xl sm:px-6 lg:px-8 space-y-8">
                    {/* Success/Error Message Anchor */}
                    <div id="successMessage" className="empty:hidden rounded-2xl p-4 text-center text-sm font-bold transition-all animate-in fade-in slide-in-from-top-4 duration-300"></div>

                    <div className="grid grid-cols-1 gap-8">
                        {/* Main Loan Edit Form */}
                        <div>
                            <div className="bg-white dark:bg-gray-800 shadow-xl sm:rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                                <div className="p-6 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
                                    <h3 className="font-bold text-gray-900 dark:text-white flex items-center">
                                        <FontAwesomeIcon icon={faEdit} className="mr-2 text-indigo-500" />
                                        Primary Parameters
                                    </h3>
                                </div>
                                <div className="p-6">
                                    <form onSubmit={handleSubmit} className="space-y-6">
                                        <div className="space-y-1.5">
                                            <InputLabel htmlFor="provider" value="Provider Name" className="text-xs font-bold uppercase tracking-wider text-gray-500" />
                                            <TextInput
                                                id="provider"
                                                value={data.provider}
                                                onChange={(e) => setData("provider", e.target.value)}
                                                type="text"
                                                className="block w-full rounded-xl"
                                                required
                                            />
                                            <InputError message={errors.provider} />
                                        </div>

                                        <div className="space-y-1.5">
                                            <InputLabel htmlFor="amount" value="Principal Amount (₹)" className="text-xs font-bold uppercase tracking-wider text-gray-500" />
                                            <div className="relative">
                                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                    <span className="text-gray-500 sm:text-sm font-bold">₹</span>
                                                </div>
                                                <TextInput
                                                    id="amount"
                                                    value={data.amount}
                                                    onChange={(e) => setData("amount", e.target.value)}
                                                    type="number"
                                                    className="block w-full pl-7 rounded-xl"
                                                    required
                                                />
                                            </div>
                                            <InputError message={errors.amount} />
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                                <InputLabel htmlFor="processing_fee" value="Fee (₹)" className="text-xs font-bold uppercase tracking-wider text-gray-500" />
                                                <TextInput
                                                    id="processing_fee"
                                                    value={data.processing_fee}
                                                    onChange={(e) => setData("processing_fee", e.target.value)}
                                                    type="number"
                                                    className="block w-full rounded-xl"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <InputLabel htmlFor="interest_rate" value="Rate (%)" className="text-xs font-bold uppercase tracking-wider text-gray-500" />
                                                <TextInput
                                                    id="interest_rate"
                                                    value={data.interest_rate}
                                                    onChange={(e) => setData("interest_rate", e.target.value)}
                                                    type="number"
                                                    step="0.01"
                                                    className="block w-full rounded-xl"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <InputLabel htmlFor="date" value="Disbursed Date" className="text-xs font-bold uppercase tracking-wider text-gray-500" />
                                            <TextInput
                                                id="date"
                                                value={data.date}
                                                onChange={(e) => setData("date", e.target.value)}
                                                type="date"
                                                className="block w-full rounded-xl"
                                                required
                                            />
                                            <InputError message={errors.date} />
                                        </div>



                                        <div className="pt-4 mt-6 border-t border-gray-100 dark:border-gray-700">
                                            <button
                                                type="submit"
                                                disabled={data.processing}
                                                className="w-full inline-flex items-center justify-center px-6 py-3 rounded-xl bg-indigo-600 text-sm font-bold uppercase tracking-widest text-white shadow-lg shadow-indigo-200 dark:shadow-indigo-900/20 transition-all hover:bg-indigo-700 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50"
                                            >
                                                <FontAwesomeIcon icon={faSave} className="mr-2" />
                                                Update Primary Details
                                            </button>
                                            <p id="loanUpdateSuccess" className="text-center text-xs mt-3 empty:hidden"></p>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        </div>

                        {/* Document Management Section */}
                        <div>
                            <div className="bg-white dark:bg-gray-800 shadow-xl sm:rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                                <div className="p-6 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
                                    <h3 className="font-bold text-gray-900 dark:text-white flex items-center">
                                        <FontAwesomeIcon icon={faFileAlt} className="mr-2 text-indigo-500" />
                                        Document Management
                                    </h3>
                                </div>
                                <div className="p-6 space-y-8">
                                    {/* Existing Documents */}
                                    <div className="space-y-4">
                                        <h4 className="font-bold text-gray-900 dark:text-white text-sm uppercase tracking-wider">Existing Documents</h4>
                                        {documents && documents.length > 0 ? (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                {documents.map((doc) => (
                                                    <div key={doc.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-700 group hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors">
                                                        <div className="flex items-center space-x-3 overflow-hidden">
                                                            <div className="bg-white dark:bg-gray-800 p-2 rounded-lg text-indigo-500 shadow-sm">
                                                                <FontAwesomeIcon icon={faFileAlt} />
                                                            </div>
                                                            <span className="text-sm font-bold text-gray-700 dark:text-gray-300 truncate">{doc.document}</span>
                                                        </div>
                                                        <div className="flex items-center space-x-1">
                                                            <a
                                                                href={`/storage/${doc.path}`}
                                                                target="_blank"
                                                                className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
                                                                title="Download"
                                                            >
                                                                <FontAwesomeIcon icon={faDownload} />
                                                            </a>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteDocument(doc.id)}
                                                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                                                title="Delete"
                                                            >
                                                                <FontAwesomeIcon icon={faTrash} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-sm text-gray-500 italic">No documents attached to this loan.</p>
                                        )}
                                    </div>

                                    {/* Upload New Documents */}
                                    <form onSubmit={handleDocSubmit} className="space-y-4 pt-6 border-t border-gray-100 dark:border-gray-700">
                                        <div className="flex items-center justify-between">
                                            <h4 className="font-bold text-gray-900 dark:text-white text-sm uppercase tracking-wider">Upload New Documents</h4>
                                            <button
                                                type="button"
                                                onClick={addDocument}
                                                className="inline-flex items-center px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors border border-indigo-100 dark:border-indigo-800"
                                            >
                                                <FontAwesomeIcon icon={faPlus} className="mr-2" />
                                                Add File
                                            </button>
                                        </div>

                                        <div className="space-y-3">
                                            {docData.documents.map((doc, index) => (
                                                <div key={index} className="flex flex-col sm:flex-row gap-3 items-start sm:items-end p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-700 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                                    <div className="flex-1 space-y-1 w-full">
                                                        <InputLabel htmlFor={`doc_name_${index}`} value="Document Name" className="text-xs" />
                                                        <TextInput
                                                            id={`doc_name_${index}`}
                                                            value={doc.name}
                                                            onChange={(e) => handleDocumentChange(index, "name", e.target.value)}
                                                            className="block w-full text-sm py-1.5 rounded-lg"
                                                            placeholder="e.g. Agreement, Insurance..."
                                                            required
                                                        />
                                                    </div>

                                                    <div className="flex-1 space-y-1 w-full">
                                                        <InputLabel htmlFor={`doc_file_${index}`} value="Select File" className="text-xs" />
                                                        <input
                                                            id={`doc_file_${index}`}
                                                            type="file"
                                                            onChange={(e) => handleDocumentChange(index, "file", e.target.files[0])}
                                                            className="block w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg"
                                                            required
                                                        />
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={() => removeDocument(index)}
                                                        className="sm:mb-[1px] h-[38px] w-[38px] flex-none inline-flex items-center justify-center text-red-500 hover:text-white hover:bg-red-500 rounded-lg transition-colors border border-red-200 dark:border-red-900/30 hover:border-red-500"
                                                        title="Remove"
                                                    >
                                                        <FontAwesomeIcon icon={faTimes} />
                                                    </button>
                                                </div>
                                            ))}
                                            {docData.documents.length === 0 && (
                                                <div className="text-center py-6 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50/50 dark:bg-gray-900/50">
                                                    <p className="text-xs text-gray-400 italic">Click "Add File" to attach new documents</p>
                                                </div>
                                            )}
                                        </div>

                                        {docData.documents.length > 0 && (
                                            <div className="pt-2">
                                                <button
                                                    type="submit"
                                                    disabled={docProcessing}
                                                    className="w-full inline-flex items-center justify-center px-6 py-3 rounded-xl bg-indigo-600 text-sm font-bold uppercase tracking-widest text-white shadow-lg shadow-indigo-200 dark:shadow-indigo-900/20 transition-all hover:bg-indigo-700 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    <FontAwesomeIcon icon={faUpload} className="mr-2" />
                                                    {docProcessing ? "Uploading..." : "Upload Documents"}
                                                </button>
                                            </div>
                                        )}
                                        <div id="docSuccessMessage" className="empty:hidden text-center text-xs mt-2"></div>
                                    </form>
                                </div>
                            </div>
                        </div>

                        {/* EMI Schedule Management */}
                        <div>
                            <div className="bg-white dark:bg-gray-800 shadow-xl sm:rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                                <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50">
                                    <div>
                                        <h3 className="font-bold text-gray-900 dark:text-white flex items-center">
                                            <FontAwesomeIcon icon={faHistory} className="mr-2 text-indigo-500" />
                                            Repayment Adjustment
                                        </h3>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Manual override for system-generated EMI dates and amounts</p>
                                    </div>
                                    <button
                                        onClick={handleEmiSubmit}
                                        className="inline-flex items-center px-4 py-2 rounded-xl bg-green-600 text-xs font-black uppercase text-white shadow-sm transition-all hover:bg-green-700 active:scale-95"
                                    >
                                        <FontAwesomeIcon icon={faCheckCircle} className="mr-2" />
                                        Save All EMIs
                                    </button>
                                </div>
                                <div className="p-0 overflow-x-auto">
                                    <input type="hidden" id="loan_detail_id" value={loanDetail.id} />
                                    <table className="w-full text-sm text-left border-collapse">
                                        <thead>
                                            <tr className="bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-600">
                                                <th className="px-6 py-4 font-bold uppercase text-[10px] tracking-widest">No.</th>
                                                <th className="px-6 py-4 font-bold uppercase text-[10px] tracking-widest">EMI Amount (₹)</th>
                                                <th className="px-6 py-4 font-bold uppercase text-[10px] tracking-widest">Due Date</th>
                                                <th className="px-6 py-4 font-bold uppercase text-[10px] tracking-widest text-center">Status / Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                                            {emiDetails && emiDetails.map((emi, key) => (
                                                <tr key={key} className="hover:bg-gray-50/80 dark:hover:bg-gray-700/40 transition-colors">
                                                    <td className="px-6 py-4 font-bold text-gray-400">{key + 1}.</td>
                                                    <td className="px-6 py-4">
                                                        <input
                                                            type="number"
                                                            value={emi.amount}
                                                            onChange={(e) => handleInputChange(key, "amount", e.target.value)}
                                                            className="w-full bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 rounded-lg text-sm font-bold text-gray-700 dark:text-gray-300 focus:ring-indigo-500 py-1.5"
                                                        />
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <input
                                                            type="date"
                                                            value={emi.due_date}
                                                            onChange={(e) => handleInputChange(key, "due_date", e.target.value)}
                                                            className="w-full bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 rounded-lg text-sm font-bold text-gray-700 dark:text-gray-300 focus:ring-indigo-500 py-1.5"
                                                        />
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        {emi.status === "paid" ? (
                                                            <span className="inline-flex items-center px-3 py-1.5 rounded-xl bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] font-black uppercase tracking-wider shadow-sm border border-green-200 dark:border-green-800/50">
                                                                <FontAwesomeIcon icon={faCheckCircle} className="mr-1.5" />
                                                                Paid
                                                            </span>
                                                        ) : (
                                                            <button
                                                                onClick={(e) => handleEmiSkip(loanDetail.id, emi.id, e)}
                                                                type="button"
                                                                className="inline-flex items-center px-3 py-1.5 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-[10px] font-black uppercase tracking-wider border border-red-100 dark:border-red-800 transition-all hover:bg-red-100"
                                                            >
                                                                <FontAwesomeIcon icon={faBan} className="mr-1.5" />
                                                                Skipped
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="p-6 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-700">
                                    <div className="flex justify-end">
                                        <button
                                            onClick={handleEmiSubmit}
                                            className="px-8 py-3 rounded-xl bg-indigo-600 text-xs font-black uppercase tracking-widest text-white shadow-xl shadow-indigo-200 dark:shadow-indigo-900/20 transition-all hover:bg-indigo-700 active:scale-95"
                                        >
                                            Save All Adjustments
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
