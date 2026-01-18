import AuthenticatedLayout from "@/Layouts/AuthenticatedLayout";
import { Head, useForm, Link } from "@inertiajs/react";
import InputError from "@/Components/InputError";
import InputLabel from "@/Components/InputLabel";
import TextInput from "@/Components/TextInput";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faSave, faCalendarAlt, faPercentage, faMoneyBillWave, faUniversity, faPlus, faMinus } from "@fortawesome/free-solid-svg-icons";
import { useState, useEffect } from "react";

export default function Create({ mustVerifyEmail, users }) {
    const { data, setData, post, errors, reset } = useForm({
        provider: "",
        amount: "",
        processing_fee: "",
        interest_rate: "",
        tenure: "",
        emi_amount: "",
        loan_type: "tenure",
        date: "",
        documents: [],
    });

    const [loan_type, setLoanType] = useState("tenure");

    const handleLoanTypeChange = (e) => {
        const selectedType = e.target.value;

        // Use functional form of setData to ensure consistent updates
        setData((prevData) => ({
            ...prevData,
            loan_type: selectedType,
            emi_amount: "", // Reset EMI amount
            tenure: "", // Reset Number of EMIs
        }));
    };

    const addDocument = () => {
        setData("documents", [...data.documents, { name: "", file: null }]);
    };

    const removeDocument = (index) => {
        const newDocs = [...data.documents];
        newDocs.splice(index, 1);
        setData("documents", newDocs);
    };

    const handleDocumentChange = (index, field, value) => {
        const newDocs = [...data.documents];
        newDocs[index][field] = value;
        setData("documents", newDocs);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        post(route("loan-detail.store"));
    }
    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 text-center sm:text-left">
                    <div>
                        <h2 className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400 leading-tight">
                            Add New Loan
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Register a new loan entry to start tracking EMIs</p>
                    </div>

                    <Link
                        href={route("loan-detail.index")}
                        className="inline-flex items-center px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-bold text-gray-700 dark:text-gray-200 shadow-sm transition-all duration-200 hover:bg-gray-50 dark:hover:bg-gray-700 hover:-translate-y-0.5"
                    >
                        <FontAwesomeIcon icon={faArrowLeft} className="mr-2" />
                        Back to List
                    </Link>
                </div>
            }
        >
            <Head title="Loan Detail" />

            <div className="py-8">
                <div className="mx-auto max-w-4xl sm:px-6 lg:px-8">
                    <div className="bg-white dark:bg-gray-800 overflow-hidden shadow-xl sm:rounded-2xl border border-gray-100 dark:border-gray-700">
                        <div className="p-8">
                            <form onSubmit={handleSubmit} className="space-y-8" encType="multipart/form-data">
                                {/* Basic Info Section */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="md:col-span-2 border-b border-gray-100 dark:border-gray-700 pb-2">
                                        <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center">
                                            <FontAwesomeIcon icon={faUniversity} className="mr-2 text-indigo-500" />
                                            Loan Information
                                        </h3>
                                    </div>

                                    <div className="space-y-1.5">
                                        <InputLabel htmlFor="provider" value="Bank / Provider Name" className="text-xs font-bold uppercase tracking-wider text-gray-500" />
                                        <div className="relative">
                                            <TextInput
                                                id="provider"
                                                value={data.provider}
                                                onChange={(e) => setData("provider", e.target.value)}
                                                type="text"
                                                className="block w-full rounded-xl border-gray-200 dark:border-gray-700 dark:bg-gray-900 focus:ring-indigo-500"
                                                placeholder="e.g. HDFC Bank, KreditBee"
                                                required
                                            />
                                        </div>
                                        <InputError message={errors.provider} className="mt-1" />
                                    </div>

                                    <div className="space-y-1.5">
                                        <InputLabel htmlFor="date" value="Disbursed Date" className="text-xs font-bold uppercase tracking-wider text-gray-500" />
                                        <div className="relative">
                                            <TextInput
                                                id="date"
                                                value={data.date}
                                                onChange={(e) => setData("date", e.target.value)}
                                                type="date"
                                                className="block w-full rounded-xl border-gray-200 dark:border-gray-700 dark:bg-gray-900"
                                                required
                                            />
                                        </div>
                                        <InputError message={errors.date} className="mt-1" />
                                    </div>

                                    <div className="space-y-1.5">
                                        <InputLabel htmlFor="amount" value="Loan Amount (₹)" className="text-xs font-bold uppercase tracking-wider text-gray-500" />
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                <span className="text-gray-500 sm:text-sm">₹</span>
                                            </div>
                                            <TextInput
                                                id="amount"
                                                value={data.amount}
                                                onChange={(e) => setData("amount", e.target.value)}
                                                type="number"
                                                className="block w-full pl-7 rounded-xl border-gray-200 dark:border-gray-700 dark:bg-gray-900"
                                                placeholder="0.00"
                                                required
                                            />
                                        </div>
                                        <InputError message={errors.amount} className="mt-1" />
                                    </div>

                                    <div className="space-y-1.5">
                                        <InputLabel htmlFor="processing_fee" value="Processing Fee (₹)" className="text-xs font-bold uppercase tracking-wider text-gray-500" />
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                <span className="text-gray-500 sm:text-sm">₹</span>
                                            </div>
                                            <TextInput
                                                id="processing_fee"
                                                value={data.processing_fee}
                                                onChange={(e) => setData("processing_fee", e.target.value)}
                                                type="number"
                                                className="block w-full pl-7 rounded-xl border-gray-200 dark:border-gray-700 dark:bg-gray-900"
                                                placeholder="0.00"
                                            />
                                        </div>
                                        <InputError message={errors.processing_fee} className="mt-1" />
                                    </div>

                                    <div className="space-y-1.5">
                                        <InputLabel htmlFor="interest_rate" value="Interest Rate (%)" className="text-xs font-bold uppercase tracking-wider text-gray-500" />
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                <FontAwesomeIcon icon={faPercentage} className="text-gray-400 text-xs" />
                                            </div>
                                            <TextInput
                                                id="interest_rate"
                                                value={data.interest_rate}
                                                onChange={(e) => setData("interest_rate", e.target.value)}
                                                type="number"
                                                step="0.01"
                                                className="block w-full pl-8 rounded-xl border-gray-200 dark:border-gray-700 dark:bg-gray-900"
                                                placeholder="0.00"
                                                required
                                            />
                                        </div>
                                        <InputError message={errors.interest_rate} className="mt-1" />
                                    </div>

                                    <div className="md:col-span-2 pt-4 border-t border-gray-100 dark:border-gray-700">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gray-50 dark:bg-gray-900/50 p-4 rounded-2xl">
                                            <div>
                                                <h4 className="font-bold text-gray-900 dark:text-white">Repayment Type</h4>
                                                <p className="text-sm text-gray-500 dark:text-gray-400 text-xs">How do you want to calculate the EMIs?</p>
                                            </div>
                                            <div className="flex p-1 bg-gray-200 dark:bg-gray-700 rounded-xl w-fit">
                                                <button
                                                    type="button"
                                                    onClick={() => handleLoanTypeChange({ target: { value: 'tenure' } })}
                                                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${data.loan_type === 'tenure' ? 'bg-white dark:bg-gray-600 shadow-sm text-indigo-600 dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
                                                >
                                                    Tenure (Months)
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleLoanTypeChange({ target: { value: 'emi_amount' } })}
                                                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${data.loan_type === 'emi_amount' ? 'bg-white dark:bg-gray-600 shadow-sm text-indigo-600 dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
                                                >
                                                    EMI Amount
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="md:col-span-2">
                                        {data.loan_type === "tenure" ? (
                                            <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-300">
                                                <InputLabel htmlFor="tenure" value="Loan Tenure (Number of Months)" className="text-xs font-bold uppercase tracking-wider text-gray-500" />
                                                <TextInput
                                                    id="tenure"
                                                    value={data.tenure}
                                                    onChange={(e) => setData("tenure", e.target.value)}
                                                    type="number"
                                                    className="block w-full rounded-xl border-gray-200 dark:border-gray-700 dark:bg-gray-900"
                                                    placeholder="e.g. 12, 24, 36"
                                                    required
                                                />
                                                <InputError message={errors.tenure} className="mt-1" />
                                            </div>
                                        ) : (
                                            <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-300">
                                                <InputLabel htmlFor="emi_amount" value="Fixed EMI Amount (₹)" className="text-xs font-bold uppercase tracking-wider text-gray-500" />
                                                <div className="relative">
                                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                        <span className="text-gray-500 sm:text-sm">₹</span>
                                                    </div>
                                                    <TextInput
                                                        id="emi_amount"
                                                        value={data.emi_amount}
                                                        onChange={(e) => setData("emi_amount", e.target.value)}
                                                        type="number"
                                                        className="block w-full pl-7 rounded-xl border-gray-200 dark:border-gray-700 dark:bg-gray-900"
                                                        placeholder="0.00"
                                                        required
                                                    />
                                                </div>
                                                <InputError message={errors.emi_amount} className="mt-1" />
                                            </div>
                                        )}
                                    </div>

                                    <div className="md:col-span-2 border-b border-gray-100 dark:border-gray-700 pb-2">
                                        <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center">
                                            <FontAwesomeIcon icon={faUniversity} className="mr-2 text-indigo-500" />
                                            Loan Documents
                                        </h3>
                                    </div>

                                    <div className="md:col-span-2 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <InputLabel value="Documents" className="text-xs font-bold uppercase tracking-wider text-gray-500" />
                                            <button
                                                type="button"
                                                onClick={addDocument}
                                                className="inline-flex items-center px-3 py-1 bg-indigo-600 border border-transparent rounded-lg font-semibold text-xs text-white uppercase tracking-widest hover:bg-indigo-700 active:bg-indigo-900 focus:outline-none focus:border-indigo-900 focus:ring ring-indigo-300 disabled:opacity-25 transition ease-in-out duration-150"
                                            >
                                                <FontAwesomeIcon icon={faPlus} className="mr-2" />
                                                Add Document
                                            </button>
                                        </div>

                                        {data.documents.map((doc, index) => (
                                            <div key={index} className="flex flex-col sm:flex-row gap-4 items-start bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700 transition-all hover:bg-gray-100 dark:hover:bg-gray-800/50">
                                                <div className="flex-1 w-full">
                                                    <InputLabel htmlFor={`doc_name_${index}`} value="Document Name" className="mb-1" />
                                                    <TextInput
                                                        id={`doc_name_${index}`}
                                                        value={doc.name}
                                                        onChange={(e) => handleDocumentChange(index, "name", e.target.value)}
                                                        type="text"
                                                        className="block w-full rounded-xl border-gray-200 dark:border-gray-700 dark:bg-gray-900 focus:ring-indigo-500"
                                                        placeholder="e.g. Aadhar Card"
                                                        required
                                                    />
                                                    <InputError message={errors[`documents.${index}.name`]} className="mt-1" />
                                                </div>
                                                <div className="flex-1 w-full relative">
                                                    <InputLabel htmlFor={`doc_file_${index}`} value="File" className="mb-1" />
                                                    <div className="relative">
                                                        <input
                                                            id={`doc_file_${index}`}
                                                            type="file"
                                                            onChange={(e) => handleDocumentChange(index, "file", e.target.files[0])}
                                                            className="block w-full text-sm text-gray-500
                                                                file:mr-4 file:py-2.5 file:px-4
                                                                file:rounded-l-xl file:border-0
                                                                file:text-xs file:font-semibold
                                                                file:bg-indigo-50 file:text-indigo-700
                                                                hover:file:bg-indigo-100
                                                                dark:file:bg-gray-700 dark:file:text-gray-300
                                                                border border-gray-200 dark:border-gray-700 dark:bg-gray-900 rounded-xl
                                                                bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
                                                            "
                                                            required={!doc.file}
                                                        />
                                                    </div>
                                                    <InputError message={errors[`documents.${index}.file`]} className="mt-1" />
                                                </div>
                                                <div className="flex-none">
                                                    <InputLabel value="Remove" className="mb-1 invisible" />
                                                    <button
                                                        type="button"
                                                        onClick={() => removeDocument(index)}
                                                        className="size-[42px] inline-flex items-center justify-center text-red-500 hover:text-white hover:bg-red-500 rounded-xl transition-colors border border-transparent hover:border-red-600 shadow-sm"
                                                        title="Remove Document"
                                                    >
                                                        <FontAwesomeIcon icon={faMinus} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}

                                        {data.documents.length === 0 && (
                                            <div className="text-center py-6 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                                                <p className="text-sm text-gray-500">No documents added yet.</p>
                                                <button type="button" onClick={addDocument} className="mt-2 text-indigo-600 hover:text-indigo-500 text-sm font-medium">Add a document</button>
                                            </div>
                                        )}
                                        <InputError message={errors.documents} className="mt-1" />
                                    </div>
                                </div>

                                <div className="pt-6 flex items-center justify-end space-x-3 border-t border-gray-100 dark:border-gray-700">
                                    <Link
                                        href={route("loan-detail.index")}
                                        className="px-6 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-bold uppercase tracking-widest text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                                    >
                                        Cancel
                                    </Link>
                                    <button
                                        type="submit"
                                        disabled={data.processing}
                                        className="inline-flex items-center px-8 py-2.5 rounded-xl border border-transparent bg-indigo-600 text-sm font-bold uppercase tracking-widest text-white shadow-lg shadow-indigo-200 dark:shadow-indigo-900/20 transition-all hover:bg-indigo-700 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50"
                                    >
                                        <FontAwesomeIcon icon={faSave} className="mr-2" />
                                        Save Loan
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
