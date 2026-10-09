<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Replaces any password that equals the old hardcoded default with a random,
 * unguessable one.
 *
 * Until recently every Google-created account (and the seeded accounts) had the
 * constant password 'razorpod.in', which is public in the repository. On a
 * publicly reachable deployment that is a working login for anyone who knows the
 * account's email. This command closes that for rows that already exist.
 *
 * Idempotent: a second run finds nothing. Affected users are not locked out of
 * the app — they sign in with Google (existing accounts are matched by email) or
 * set a new password through "Forgot password".
 */
class InvalidateDefaultPasswords extends Command
{
    protected $signature = 'auth:invalidate-default-passwords';

    protected $description = 'Replace accounts still using the old hardcoded default password with a random one';

    /** The retired default. Kept only so it can be recognised and removed. */
    private const RETIRED_DEFAULT = 'razorpod.in';

    public function handle(): int
    {
        $replaced = 0;

        foreach (User::query()->whereNotNull('password')->cursor() as $user) {
            if (Hash::check(self::RETIRED_DEFAULT, $user->password)) {
                // The model's 'hashed' cast hashes the random value on save.
                $user->forceFill(['password' => Str::random(64)])->save();
                $replaced++;
            }
        }

        // Counts only: this runs in container logs, so no emails here.
        $this->info("Invalidated {$replaced} account(s) using the retired default password.");

        return self::SUCCESS;
    }
}
