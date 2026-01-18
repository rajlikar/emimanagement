<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class LoanDetailRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            "provider" =>['required'],
            "amount" =>['required'],
            "processing_fee" =>['required'],
            "interest_rate" =>['required','numeric','min:0','max:100'],
            "tenure" => ['nullable', 'integer', 'required_without:emi_amount'],
            "emi_amount" => ['nullable', 'required_without:tenure'],
            "date" =>['required','date'],
            "documents" => ['nullable', 'array'],
            "documents.*.file" => ['required', 'file', 'mimes:pdf,doc,docx', 'max:2048'],
            "documents.*.name" => ['required', 'string', 'max:255'],
        ];
    }

    public function messages()
    {
        return [
            'documents.*.file.required' => 'Please upload the document.',
            'documents.*.file.mimes' => 'Only PDF, DOC, and DOCX files are allowed.',
            'documents.*.file.max' => 'Document size must be less than 2MB.',
            'documents.*.name.required' => 'Document name is required.',
        ];
    }
}
