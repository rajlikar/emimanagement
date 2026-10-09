<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Throwable;

class LoanDocument extends Model
{
    protected $fillable = [
        'loan_details_id',
        'document',
        'path',
    ];

    protected static function booted(): void
    {
        // One choke point: however the row goes (the delete button, deleting its
        // loan, deleting the account), its file goes with it. Database cascades
        // alone never touch files, which used to leave orphans in the bucket.
        static::deleted(fn (LoanDocument $document) => $document->removeStoredFile());
    }

    /**
     * Delete this document's file from the public disk (the GCS bucket mount in
     * production). A failure is logged but never blocks the row deletion: the
     * user asked for the document to be gone.
     */
    public function removeStoredFile(): void
    {
        // '0' is what a failed write used to be saved as; it is not a real path.
        if ($this->path === null || $this->path === '' || $this->path === '0') {
            return;
        }

        try {
            Storage::disk('public')->delete($this->path);
        } catch (Throwable $e) {
            Log::warning('Could not delete stored document file', [
                'document_id' => $this->id,
                'path' => $this->path,
                'error' => $e->getMessage(),
            ]);
        }
    }

    public function loanDetail()
    {
        return $this->belongsTo(LoanDetail::class, 'loan_details_id');
    }
}
