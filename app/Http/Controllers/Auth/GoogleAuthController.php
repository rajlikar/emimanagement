<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Laravel\Socialite\Facades\Socialite;
use Exception;
use App\Models\User;

class GoogleAuthController extends Controller
{
    public function redirectToGoogle()
    {
        //redirect to google 
        return Socialite::driver('google')->redirect();
    }

    public function loginWithGoogle(Request $request)
    {
        try {

            $googleUser = Socialite::driver('google')->user();

            if (!$googleUser->getEmail()) {
                throw new Exception('Email not provided by Google.');
            }

            // If the user exists, update their record; otherwise, create a new one
            $user = User::where('email', $googleUser->getEmail())->first();

            if ($user) {
                // Update existing user with Google ID
                $user->update([
                    'google_id' => $googleUser->getId(),
                    'name' => $googleUser->getName(),
                ]);
            } else {
                // Only an allowed address may create an account here.
                if (! User::isEmailAllowed($googleUser->getEmail())) {
                    return redirect()->route('login')->with('error', 'Sign-ups are closed. This is a private tool.');
                }

                // Create new user
                $user = User::create([
                    'name' => $googleUser->getName(),
                    'email' => $googleUser->getEmail(),
                    'google_id' => $googleUser->getId(),
                    // Google-only accounts never use this password, so it must not
                    // be guessable. It used to be the constant 'razorpod.in', which
                    // let anyone who knew a Google user's email sign in with it. The
                    // User model's 'hashed' cast hashes the random value on save.
                    'password' => Str::random(64),
                ]);
            }
            Auth::login($user);
            return redirect()->route('dashboard');

        } catch (Exception $e) {
            // dd() here would render a full stack trace — including
            // environment values — to whoever hit this callback. Log it
            // server-side and send the user back to login with a generic
            // message instead.
            Log::error('Google login failed', [
                'error' => $e->getMessage(),
            ]);

            return redirect()->route('login')->with('error', 'Unable to sign in with Google. Please try again.');
        }
    }
}
