<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReminderEndpointTest extends TestCase
{
    use RefreshDatabase;

    private const URL = '/internal/send-emi-reminders';

    public function test_endpoint_is_disabled_when_no_token_is_configured(): void
    {
        config(['services.reminder.token' => null]);

        // Even an empty header must not match an unset token.
        $this->post(self::URL, [], ['X-Reminder-Token' => ''])->assertNotFound();
    }

    public function test_wrong_or_missing_token_is_rejected_as_not_found(): void
    {
        config(['services.reminder.token' => 'correct-token']);

        $this->post(self::URL)->assertNotFound();
        $this->post(self::URL, [], ['X-Reminder-Token' => 'wrong'])->assertNotFound();
    }

    public function test_correct_token_runs_the_reminder_command(): void
    {
        config(['services.reminder.token' => 'correct-token']);

        // No EMIs are due in an empty database, so the command is a no-op and
        // returns immediately (it only sleeps between actual emails).
        $this->post(self::URL, [], ['X-Reminder-Token' => 'correct-token'])
            ->assertOk()
            ->assertExactJson(['ok' => true]);
    }

    public function test_endpoint_needs_no_user_session_or_csrf_token(): void
    {
        config(['services.reminder.token' => 'correct-token']);

        $this->assertGuest();
        $this->post(self::URL, [], ['X-Reminder-Token' => 'correct-token'])->assertOk();
    }

    public function test_get_is_not_allowed(): void
    {
        config(['services.reminder.token' => 'correct-token']);

        $this->get(self::URL, ['X-Reminder-Token' => 'correct-token'])->assertStatus(405);
    }
}
