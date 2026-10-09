<?php

/**
 * One-time copy of the application's data from MySQL into a fresh SQLite file.
 *
 * Run it LOCALLY (not in the container), with .env pointing at the MySQL
 * database to read:
 *
 *     php scripts/mysql-to-sqlite.php <target.sqlite>
 *
 * Read-only against MySQL; it only ever writes to <target.sqlite>, and refuses
 * to touch a file that already holds tables. The result is then seeded into the
 * Litestream replica — see docs/cloud-run-sqlite-litestream.md §5.
 *
 * Copied: users, loan_details, emi_details, contact_forms, loan_documents.
 * Deliberately NOT copied: sessions (everyone signs in again), cache, jobs,
 * password_reset_tokens (short-lived), migrations (the migrator rebuilds it).
 */

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

require __DIR__ . '/../vendor/autoload.php';

$app = require __DIR__ . '/../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$target = $argv[1] ?? null;
if (! $target) {
    fwrite(STDERR, "usage: php scripts/mysql-to-sqlite.php <target.sqlite>\n");
    exit(2);
}
if (config('database.default') !== 'mysql') {
    fwrite(STDERR, "refusing to run: .env DB_CONNECTION is '" . config('database.default') . "', expected 'mysql' (the source).\n");
    exit(2);
}
if (file_exists($target) && filesize($target) > 0) {
    fwrite(STDERR, "refusing to run: $target already exists and is not empty.\n");
    exit(2);
}
touch($target);

// Tables in parent -> child order, so foreign keys are satisfiable even though
// enforcement is switched off during the copy.
const TABLES = ['users', 'loan_details', 'emi_details', 'contact_forms', 'loan_documents'];

config(['database.connections.sqlite_target' => [
    'driver' => 'sqlite',
    'database' => realpath($target),
    'prefix' => '',
    'foreign_key_constraints' => false,
    'busy_timeout' => 5000,
    'journal_mode' => 'WAL',
    'synchronous' => 'NORMAL',
]]);

echo "1/4 creating schema in SQLite via the real migrations...\n";
$exit = Artisan::call('migrate', ['--database' => 'sqlite_target', '--force' => true, '--no-ansi' => true]);
if ($exit !== 0) {
    fwrite(STDERR, Artisan::output());
    exit(1);
}

$src = DB::connection('mysql');
$dst = DB::connection('sqlite_target');

echo "2/4 copying rows...\n";
$dst->beginTransaction();
try {
    foreach (TABLES as $table) {
        if (! Schema::connection('mysql')->hasTable($table)) {
            echo "    $table: absent in source, skipped\n";
            continue;
        }
        // Only columns present on both sides; a column added on one side only
        // would otherwise abort the copy.
        $cols = array_values(array_intersect(
            Schema::connection('mysql')->getColumnListing($table),
            Schema::connection('sqlite_target')->getColumnListing($table),
        ));

        $copied = 0;
        $src->table($table)->orderBy('id')->select($cols)->chunk(500, function ($rows) use ($dst, $table, &$copied) {
            $dst->table($table)->insert($rows->map(fn ($r) => (array) $r)->all());
            $copied += $rows->count();
        });
        echo "    $table: $copied rows\n";
    }
    $dst->commit();
} catch (Throwable $e) {
    $dst->rollBack();
    fwrite(STDERR, "copy failed, SQLite file left empty of data: " . $e->getMessage() . "\n");
    exit(1);
}

echo "3/4 verifying counts and money totals...\n";
$ok = true;
foreach (TABLES as $table) {
    if (! Schema::connection('mysql')->hasTable($table)) {
        continue;
    }
    $a = $src->table($table)->count();
    $b = $dst->table($table)->count();
    $status = $a === $b ? 'ok' : 'MISMATCH';
    $ok = $ok && $a === $b;
    echo sprintf("    %-14s mysql=%d sqlite=%d  %s\n", $table, $a, $b, $status);
}
foreach ([['loan_details', 'amount'], ['loan_details', 'emi_amount'], ['emi_details', 'amount']] as [$t, $c]) {
    if (! Schema::connection('mysql')->hasColumn($t, $c)) {
        continue;
    }
    $a = (string) $src->table($t)->sum($c);
    $b = (string) $dst->table($t)->sum($c);
    $same = abs((float) $a - (float) $b) < 0.005;
    $ok = $ok && $same;
    echo sprintf("    SUM(%s.%s) mysql=%s sqlite=%s  %s\n", $t, $c, $a, $b, $same ? 'ok' : 'MISMATCH');
}

echo "4/4 integrity checks...\n";
$fk = $dst->select('PRAGMA foreign_key_check');
$integrity = $dst->selectOne('PRAGMA integrity_check')->integrity_check ?? 'unknown';
echo "    integrity_check: $integrity\n    foreign_key_check violations: " . count($fk) . "\n";
$ok = $ok && $integrity === 'ok' && count($fk) === 0;

// Fold the WAL back into the main file so $target is a single self-contained
// file that can be copied or replicated as-is.
$dst->statement('PRAGMA wal_checkpoint(TRUNCATE)');

echo $ok ? "\nDONE: $target is ready.\n" : "\nFAILED: do not use $target.\n";
exit($ok ? 0 : 1);
