<?php

namespace App\Http\Controllers;

use App\Models\LoanDocument;
use Carbon\Carbon;
use App\Models\User;
use Inertia\Inertia;
use App\Models\EmiDetail;
use App\Models\LoanDetail;
use Illuminate\Support\Str;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use App\Http\Requests\LoanDetailRequest;
use App\Http\Resources\LoanDetailResource;
use Illuminate\Http\UploadedFile;

class LoanDetailController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index()
    {
        // $loanDetail = LoanDetail::get();
        // return Inertia::render('LoanDetail',compact('loanDetail'));

        $query = LoanDetail::where('user_id', Auth::user()->id);
        $sortField = request('sort_field', 'created_at');
        $sortDirection = request('sort_direction', 'desc');
        if (request('name')) {
            $query->where('name', 'like', '%' . request('name') . '%');
        }
        if (request('status')) {
            $query->where('status', request('status'));
        }
        $LoanDetails = $query->orderBy($sortField, $sortDirection)->paginate(10)->onEachSide(1);
        // dd(LoanDetailResource::collection($LoanDetails));
        return inertia('LoanDetail', [
            'loanDetails' => LoanDetailResource::collection($LoanDetails),
            'queryParams' => request()->query() ?: null,
            'success' => session('success')
        ]);
    }

    /**
     * Show the form for creating a new resource.
     */
    public function create()
    {
        $users = User::select('id', 'name')->get();
        return inertia('Create', compact('users'));
    }

    /**
     * Calculate EMI details based on loan type and parameters
     */
    private function calculateEmiDetails($amount, $loanType, $interestRate, $tenure = null, $emiAmountPre = null)
    {
        $emiAmount = 0;
        $totalAmount = 0;
        $emiCount = 0;
        $remainingAmount = 0;

        if ($loanType == 'tenure') {
            $annualInterestRate = (float) $interestRate; // as % e.g. 10.5
            $monthlyRate = $annualInterestRate / 12 / 100; // convert to monthly decimal

            // Guard against invalid tenure
            if ((int) $tenure <= 0) {
                // No EMIs can be calculated with non-positive tenure
                $emiAmount = 0;
                $totalAmount = (float) $amount;
                $emiCount = 0;
            } elseif ($monthlyRate == 0.0) {
                // Zero-interest loan: EMI is simple principal divided by tenure
                $emiAmount = (float) $amount / (int) $tenure;
                $totalAmount = (float) $amount; // No interest added
                $emiCount = (int) $tenure;
            } else {
                // Standard EMI formula for non-zero interest
                $factor = pow(1 + $monthlyRate, (int) $tenure);
                $denominator = $factor - 1;

                // Extra safety against rare numerical edge case
                if ($denominator == 0.0) {
                    $emiAmount = (float) $amount / (int) $tenure;
                } else {
                    $emiAmount = ((float) $amount * $monthlyRate * $factor) / $denominator;
                }

                $totalAmount = $emiAmount * (int) $tenure; // Total repayment amount
                $emiCount = (int) $tenure; // Total number of EMIs
            }
        }

        if ($loanType == 'emi_amount') {
            $interest = 0;
            $totalAmount = (float) $amount + $interest;
            $emiAmountPre = (float) $emiAmountPre;

            if ($emiAmountPre > 0) {
                $emiCount = (int) floor($totalAmount / $emiAmountPre);
                $remainingAmount = $totalAmount - ($emiCount * $emiAmountPre);
                $emiAmount = $emiAmountPre;
            } else {
                // Invalid EMI amount provided; keep counts at 0 to avoid division by zero
                $emiCount = 0;
                $remainingAmount = 0;
                $emiAmount = 0;
            }
        }

        return [
            'emi_amount' => $emiAmount,
            'total_amount' => $totalAmount,
            'emi_count' => $emiCount,
            'remaining_amount' => $remainingAmount
        ];
    }

    /**
     * Create EMI details records
     */
    private function createEmiDetails($loanDetailId, $emiAmount, $emiCount, $remainingAmount, $date)
    {
        $emiDetails = [];
        for ($i = 1; $i <= $emiCount; $i++) {
            $emiDetails[] = [
                'loan_detail_id' => $loanDetailId,
                'transaction_id' => Str::random(10),
                'amount' => round($emiAmount),
                'due_date' => Carbon::parse($date)->addMonth($i),
                'status' => 'pending',
            ];
        }
        EmiDetail::insert($emiDetails);

        // Handle remaining amount if exists
        if ($remainingAmount > 0) {
            EmiDetail::insert([
                'loan_detail_id' => $loanDetailId,
                'transaction_id' => Str::random(10),
                'amount' => round($remainingAmount),
                'due_date' => Carbon::parse($date)->addMonth($emiCount + 1),
                'status' => 'pending',
            ]);
        }
    }

    public function store(LoanDetailRequest $request)
    {
        $amount = $request->amount;
        $processingFee = $request->processing_fee;
        $interestRate = $request->interest_rate;
        $date = $request->date;

        // Calculate EMI details
        $emiCalculation = $this->calculateEmiDetails(
            $amount,
            $request->loan_type,
            $interestRate,
            $request->tenure,
            $request->emi_amount
        );

        // Create Loan Detail
        $loanDetail = new LoanDetail();
        $loanDetail->user_id = Auth::user()->id;
        $loanDetail->provider = $request->provider;
        $loanDetail->amount = $amount;
        $loanDetail->emi_amount = round($emiCalculation['emi_amount']);
        $loanDetail->processing_fee = $processingFee;
        $loanDetail->loan_type = $request->loan_type;
        $loanDetail->interest_rate = $interestRate;
        $loanDetail->emi_count = $emiCalculation['emi_count'] + ($emiCalculation['remaining_amount'] > 0 ? 1 : 0);
        $loanDetail->disbursed_date = $date;
        $loanDetail->status = 'open';

        if ($loanDetail->save()) {
            $this->createEmiDetails(
                $loanDetail->id,
                $emiCalculation['emi_amount'],
                $emiCalculation['emi_count'],
                $emiCalculation['remaining_amount'],
                $date
            );

            // if ($request->has('documents')) {
            //     foreach ($request->input('documents') as $docData) {
            //         // Check if 'file' key exists and is valid
            //         if (isset($docData['file']) && $docData['file'] instanceof \Illuminate\Http\UploadedFile) {
            //             $file = $docData['file'];
            //             $fileName = Str::uuid() . '.' . $file->getClientOriginalExtension();
            //             $filePath = $file->storeAs('loan_documents', $fileName, 'public');

            //             LoanDocument::create([
            //                 'loan_details_id' => $loanDetail->id, // Matches migration: loan_details_id
            //                 'document' => $docData['name'], // Matches migration: document
            //                 'path' => $filePath, // Matches migration: path
            //             ]);
            //         }
            //     }
            // }

            if ($request->has('documents')) {
                foreach ($request->all()['documents'] as $docData) {
                    if (isset($docData['file']) && $docData['file'] instanceof UploadedFile) {
                        $file = $docData['file'];
                        $fileName = Str::uuid() . '.' . $file->getClientOriginalExtension();
                        $filePath = $file->storeAs('loan_documents', $fileName, 'public');

                        LoanDocument::create([
                            'loan_details_id' => $loanDetail->id,
                            'document' => $docData['name'] ?? $file->getClientOriginalName(),
                            'path' => $filePath,
                        ]);
                    }
                }
            }
        }

        return redirect()->route('loan-detail.index');
    }

    public function update(LoanDetailRequest $request, LoanDetail $loanDetail)
    {
        try {
            $amount = $request->amount;
            $interestRate = $request->interest_rate;
            $date = $request->date ?? $loanDetail->disbursed_date;

            // Calculate new EMI details
            $emiCalculation = $this->calculateEmiDetails(
                $amount,
                $request->loan_type,
                $interestRate,
                $request->tenure,
                $request->emi_amount
            );

            // Update loan detail with calculated values
            $loanDetail->update([
                'provider' => $request->provider,
                'amount' => $amount,
                'emi_amount' => round($emiCalculation['emi_amount']),
                'processing_fee' => $request->processing_fee,
                'loan_type' => $request->loan_type,
                'interest_rate' => $interestRate,
                'emi_count' => $emiCalculation['emi_count'] + ($emiCalculation['remaining_amount'] > 0 ? 1 : 0),
                'disbursed_date' => $date,
            ]);

            // Delete existing EMI details and create new ones
            EmiDetail::where('loan_detail_id', $loanDetail->id)->delete();

            $this->createEmiDetails(
                $loanDetail->id,
                $emiCalculation['emi_amount'],
                $emiCalculation['emi_count'],
                $emiCalculation['remaining_amount'],
                $date
            );

            if ($request->has('documents')) {
                foreach ($request->all()['documents'] as $docData) {
                    if (isset($docData['file']) && $docData['file'] instanceof UploadedFile) {
                        $file = $docData['file'];
                        $fileName = Str::uuid() . '.' . $file->getClientOriginalExtension();
                        $filePath = $file->storeAs('loan_documents', $fileName, 'public');

                        LoanDocument::create([
                            'loan_details_id' => $loanDetail->id,
                            'document' => $docData['name'] ?? $file->getClientOriginalName(),
                            'path' => $filePath,
                        ]);
                    }
                }
            }

            return redirect()->back()->with('success', 'Loan details updated successfully!');
        } catch (\Exception $e) {
            return redirect()->back()->with('error', 'An error occurred while updating loan details.');
        }
    }

    /**
     * Display the specified resource.
     */
    public function show(LoanDetail $loanDetail)
    {
        $emiDetail = $loanDetail->emiDetail;
        $user = $loanDetail->user;
        $documents = $loanDetail->documents;
        return inertia('Show', compact('user', 'loanDetail', 'emiDetail', 'documents'));
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(LoanDetail $loanDetail)
    {
        $emiDetail = $loanDetail->emiDetail->select('id', 'loan_detail_id', 'amount', 'due_date', 'status');
        $documents = $loanDetail->documents;
        return inertia('Edit', compact('loanDetail', 'emiDetail', 'documents'));
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(LoanDetail $loanDetail)
    {
        if ($loanDetail) {
            $loanDetail->emiDetail()->delete();
            $loanDetail->delete();
        }

        if (request()->wantsJson()) {
            return response()->json(['status' => true, 'message' => 'Loan deleted successfully']);
        }

        return redirect()->route('loan-detail.index');
    }

    public function forecloseLoan(Request $request)
    {
        $loanDetail = LoanDetail::find($request->loan_id);
        // dd($loanDetail);
        if ($loanDetail) {
            $emiDetails = EmiDetail::where('loan_detail_id', $loanDetail->id)
                ->where('status', 'pending')
                ->update(['status' => 'paid']);

            $loanDetail->status = 'closed';
            $loanDetail->save();
        }

        return response()->json(['status' => true, 'message' => 'Loan is foreclosed!']);
    }

    public function destroyDocument(LoanDocument $loanDocument)
    {
        // Delete file from storage
        if ($loanDocument->path && \Illuminate\Support\Facades\Storage::disk('public')->exists($loanDocument->path)) {
            \Illuminate\Support\Facades\Storage::disk('public')->delete($loanDocument->path);
        }

        $loanDocument->delete();

        return redirect()->back()->with('success', 'Document deleted successfully!');
    }
}