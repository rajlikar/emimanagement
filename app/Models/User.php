<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasFactory, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'google_id',
        'name',
        'email',
        'password',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var array<int, string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    /**
     * Whether this email may create an account. See config('auth.allowed_emails').
     */
    public static function isEmailAllowed(string $email): bool
    {
        $allowed = config('auth.allowed_emails', []);

        return $allowed === [] || in_array(strtolower(trim($email)), $allowed, true);
    }

    protected static function booted(): void
    {
        // Account deletion relies on database cascades for the loans and their
        // documents, which never fire model events, so remove the document files
        // explicitly first.
        static::deleting(function (User $user) {
            LoanDocument::whereIn(
                'loan_details_id',
                LoanDetail::where('user_id', $user->id)->select('id')
            )->get()->each->delete();
        });
    }

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }
}
