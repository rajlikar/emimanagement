<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LoanDocument extends Model
{
    protected $fillable = [
        'loan_details_id',
        'document',
        'path',
    ];

    public function loanDetail()
    {
        return $this->belongsTo(LoanDetail::class, 'loan_details_id');
    }
}
