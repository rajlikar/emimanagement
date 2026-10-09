<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Socialite\Contracts\User as SocialiteUser;
use Laravel\Socialite\Facades\Socialite;
use Mockery;
use Tests\TestCase;

class DefaultPasswordTest extends TestCase
{
    use RefreshDatabase;

    private const RETIRED = 'razorpod.in';

    public function test_new_google_users_do_not_get_the_retired_default_password(): void
    {
        $google = Mockery::mock(SocialiteUser::class);
        $google->shouldReceive('getEmail')->andReturn('new.person@example.com');
        $google->shouldReceive('getId')->andReturn('google-123');
        $google->shouldReceive('getName')->andReturn('New Person');
        Socialite::shouldReceive('driver->user')->andReturn($google);

        $this->get('/auth/google/callback')->assertRedirect(route('dashboard'));

        $user = User::where('email', 'new.person@example.com')->firstOrFail();
        $this->assertFalse(Hash::check(self::RETIRED, $user->password));
        $this->assertTrue(Hash::isHashed($user->password));
    }

    public function test_command_replaces_the_retired_default_and_leaves_other_passwords(): void
    {
        $weak = User::factory()->create(['email' => 'weak@example.com', 'password' => self::RETIRED]);
        $strong = User::factory()->create(['email' => 'strong@example.com', 'password' => 'a-real-password-1']);
        $strongHashBefore = $strong->fresh()->password;

        $this->artisan('auth:invalidate-default-passwords')
            ->expectsOutputToContain('Invalidated 1 account')
            ->assertSuccessful();

        $this->assertFalse(Hash::check(self::RETIRED, $weak->fresh()->password));
        $this->assertSame($strongHashBefore, $strong->fresh()->password, 'unrelated hash must not change');
        $this->assertTrue(Hash::check('a-real-password-1', $strong->fresh()->password));
    }

    public function test_command_is_idempotent(): void
    {
        User::factory()->create(['password' => self::RETIRED]);

        $this->artisan('auth:invalidate-default-passwords')->expectsOutputToContain('Invalidated 1 account');
        $this->artisan('auth:invalidate-default-passwords')->expectsOutputToContain('Invalidated 0 account');
    }

    public function test_the_retired_default_no_longer_logs_in_after_cleanup(): void
    {
        $user = User::factory()->create(['email' => 'weak@example.com', 'password' => self::RETIRED]);

        $this->artisan('auth:invalidate-default-passwords')->assertSuccessful();

        $this->post('/login', ['email' => 'weak@example.com', 'password' => self::RETIRED]);
        $this->assertGuest();
    }
}
