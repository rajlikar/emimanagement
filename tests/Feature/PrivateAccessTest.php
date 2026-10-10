<?php

namespace Tests\Feature;

use App\Mail\ContactFormReceived;
use App\Models\LoanDetail;
use App\Models\LoanDocument;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Laravel\Socialite\Contracts\User as SocialiteUser;
use Laravel\Socialite\Facades\Socialite;
use Mockery;
use Tests\TestCase;

class PrivateAccessTest extends TestCase
{
    use RefreshDatabase;

    // ---- allowlist ---------------------------------------------------------

    private function allow(string ...$emails): void
    {
        config(['auth.allowed_emails' => array_map('strtolower', $emails)]);
    }

    public function test_registration_is_open_when_no_allowlist_is_configured(): void
    {
        config(['auth.allowed_emails' => []]);

        $this->post('/register', [
            'name' => 'Anyone', 'email' => 'anyone@example.com',
            'password' => 'a-strong-password-1', 'password_confirmation' => 'a-strong-password-1',
        ])->assertRedirect();

        $this->assertDatabaseHas('users', ['email' => 'anyone@example.com']);
    }

    public function test_registration_is_refused_for_an_address_not_on_the_allowlist(): void
    {
        $this->allow('me@example.com');

        $this->post('/register', [
            'name' => 'Stranger', 'email' => 'stranger@example.com',
            'password' => 'a-strong-password-1', 'password_confirmation' => 'a-strong-password-1',
        ])->assertSessionHasErrors('email');

        $this->assertDatabaseMissing('users', ['email' => 'stranger@example.com']);
        $this->assertGuest();
    }

    public function test_an_allowlisted_address_can_register_case_insensitively(): void
    {
        $this->allow('Me@Example.com');

        $this->post('/register', [
            'name' => 'Me', 'email' => 'me@example.com',
            'password' => 'a-strong-password-1', 'password_confirmation' => 'a-strong-password-1',
        ])->assertRedirect();

        $this->assertDatabaseHas('users', ['email' => 'me@example.com']);
    }

    private function googleReturns(string $email): void
    {
        $google = Mockery::mock(SocialiteUser::class);
        $google->shouldReceive('getEmail')->andReturn($email);
        $google->shouldReceive('getId')->andReturn('gid-' . md5($email));
        $google->shouldReceive('getName')->andReturn('Some Person');
        Socialite::shouldReceive('driver->user')->andReturn($google);
    }

    public function test_google_cannot_create_an_account_for_a_stranger(): void
    {
        $this->allow('me@example.com');
        $this->googleReturns('stranger@example.com');

        $this->get('/auth/google/callback')->assertRedirect(route('login'));

        $this->assertDatabaseMissing('users', ['email' => 'stranger@example.com']);
        $this->assertGuest();
    }

    public function test_google_can_create_the_allowlisted_account_and_existing_users_still_sign_in(): void
    {
        $this->allow('me@example.com');
        $this->googleReturns('me@example.com');

        $this->get('/auth/google/callback')->assertRedirect(route('dashboard'));
        $this->assertDatabaseHas('users', ['email' => 'me@example.com']);

        // An account that already exists signs in even if it is not on the list.
        auth()->logout();
        User::factory()->create(['email' => 'old@example.com']);
        $this->googleReturns('old@example.com');
        $this->get('/auth/google/callback')->assertRedirect(route('dashboard'));
        $this->assertAuthenticated();
    }

    // ---- protected documents ----------------------------------------------

    private function documentFor(User $owner): LoanDocument
    {
        Storage::fake('public');
        $loan = LoanDetail::factory()->create(['user_id' => $owner->id]);
        $this->actingAs($owner)->post(route('loan-document.upload', $loan), [
            'documents' => [['name' => 'Agreement', 'file' => UploadedFile::fake()->create('a.pdf', 20, 'application/pdf')]],
        ])->assertRedirect();
        auth()->logout();

        return LoanDocument::where('loan_details_id', $loan->id)->firstOrFail();
    }

    public function test_the_owner_can_download_their_document(): void
    {
        $owner = User::factory()->create();
        $doc = $this->documentFor($owner);

        $response = $this->actingAs($owner)->get(route('loan-document.download', $doc));

        $response->assertOk();
        $this->assertStringContainsString('private', (string) $response->headers->get('Cache-Control'));
        $this->assertSame('nosniff', $response->headers->get('X-Content-Type-Options'));
    }

    public function test_a_guest_cannot_download_a_document(): void
    {
        $doc = $this->documentFor(User::factory()->create());

        $this->get(route('loan-document.download', $doc))->assertRedirect(route('login'));
    }

    public function test_another_user_cannot_download_a_document(): void
    {
        $doc = $this->documentFor(User::factory()->create());

        $this->actingAs(User::factory()->create())
            ->get(route('loan-document.download', $doc))
            ->assertForbidden();
    }

    public function test_a_row_with_a_broken_path_returns_404_not_a_server_error(): void
    {
        $owner = User::factory()->create();
        $loan = LoanDetail::factory()->create(['user_id' => $owner->id]);
        $doc = LoanDocument::create(['loan_details_id' => $loan->id, 'document' => 'broken', 'path' => '0']);

        $this->actingAs($owner)->get(route('loan-document.download', $doc))->assertNotFound();
    }

    // ---- contact form -----------------------------------------------------

    private function submitContact()
    {
        return $this->post('/submit-contact-form', [
            'name' => 'Visitor', 'email' => 'visitor@example.com',
            'subject' => 'Hello', 'message' => 'A question',
        ]);
    }

    public function test_contact_form_notifies_the_configured_owner_only(): void
    {
        Mail::fake();
        config(['app.contact_email' => 'owner@example.com']);

        $this->submitContact()->assertRedirect();

        Mail::assertSent(ContactFormReceived::class, fn ($m) => $m->hasTo('owner@example.com'));
        Mail::assertNotSent(ContactFormReceived::class, fn ($m) => $m->hasTo('recipient@email.com'));
    }

    public function test_contact_form_sends_no_mail_when_no_owner_address_is_configured(): void
    {
        Mail::fake();
        config(['app.contact_email' => null]);

        $this->submitContact()->assertRedirect();

        Mail::assertNothingSent();
        $this->assertDatabaseCount('contact_forms', 1);
    }

    public function test_contact_form_is_rate_limited(): void
    {
        Mail::fake();
        config(['app.contact_email' => null]);

        foreach (range(1, 3) as $i) {
            $this->submitContact()->assertRedirect();
        }
        $this->submitContact()->assertStatus(429);
    }
}
