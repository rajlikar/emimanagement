<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class LoanDetail extends Model
{
    use HasFactory;

    protected static function booted(): void
    {
        // Delete documents through Eloquent, before the loan row, so each one's
        // file is removed too. The database ON DELETE CASCADE would drop the rows
        // but leave the files behind.
        static::deleting(fn (LoanDetail $loan) => $loan->documents->each->delete());
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function emiDetail(){
        return $this->hasMany(EmiDetail::class);
    }

    public function documents()
    {
        return $this->hasMany(LoanDocument::class, 'loan_details_id');
    }

    protected $fillable = [
        'provider',
        'amount',
        'emi_amount',
        'processing_fee',
        'interest_rate',
        'emi_count',
        'disbursed_date',
        'status',
    ];
}
