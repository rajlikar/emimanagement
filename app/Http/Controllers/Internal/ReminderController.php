<?php

namespace App\Http\Controllers\Internal;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Log;

/**
 * HTTP trigger for the daily EMI reminder sweep.
 *
 * On Cloud Run nothing runs `schedule:run`, so the Schedule::command() entry in
 * routes/console.php never fires. Cloud Scheduler calls this endpoint instead
 * and it runs the same `send:emi-reminder` command in-process.
 *
 * It must run in-process rather than as a Cloud Run Job: the SQLite database is
 * a local file on the serving instance, which a separate Job container cannot
 * see.
 */
class ReminderController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $expected = (string) config('services.reminder.token');
        $given = (string) $request->header('X-Reminder-Token', '');

        // Unset token = endpoint disabled. 404 rather than 401/403 so a probe
        // cannot tell that the route exists. hash_equals is constant-time.
        abort_if($expected === '' || ! hash_equals($expected, $given), 404);

        // The command sleeps 10s between emails. PHP's max_execution_time does not
        // count sleep on Linux, but lift the limit anyway; the real ceiling is the
        // reminders php-fpm pool's request_terminate_timeout.
        set_time_limit(0);

        $exitCode = Artisan::call('send:emi-reminder');

        // The command's output names recipients (email addresses), so it goes to
        // the log, not back over HTTP.
        Log::info('send:emi-reminder finished', [
            'exit_code' => $exitCode,
            'output' => trim(Artisan::output()),
        ]);

        // Non-2xx makes Cloud Scheduler treat the run as failed (and retry, if
        // retries are enabled — leave them at 0 so a failed sweep cannot mail
        // the same person twice).
        return response()->json(['ok' => $exitCode === 0], $exitCode === 0 ? 200 : 500);
    }
}
