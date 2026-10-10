<?php

namespace App\Policies;

use App\Models\LoanDocument;
use App\Models\User;

class LoanDocumentPolicy
{
    /**
     * A document has no owner column of its own — ownership is inherited
     * through the loan it's attached to.
     */
    public function view(User $user, LoanDocument $loanDocument): bool
    {
        return $user->id === $loanDocument->loanDetail->user_id;
    }

    public function delete(User $user, LoanDocument $loanDocument): bool
    {
        return $user->id === $loanDocument->loanDetail->user_id;
    }
}
