<?php

use App\Http\Controllers\DashboardController;
use Inertia\Inertia;
use Illuminate\Support\Facades\Route;
use Illuminate\Foundation\Application;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\EmiDetailController;
use App\Http\Controllers\LoanDetailController;
use App\Http\Controllers\Api\LoanDetailController as ApiLoanDetailController;
use App\Http\Controllers\Auth\GoogleAuthController;
use App\Http\Controllers\ContactFormController;
use App\Http\Controllers\Internal\ReminderController;

Route::get('/', function () {
    return Inertia::render('Welcome', [
        'canLogin' => Route::has('login'),
        'canRegister' => Route::has('register'),
        'laravelVersion' => Application::VERSION,
        'phpVersion' => PHP_VERSION,
    ]);
})->name('welcome');

Route::get('/privacy', function () {
    return Inertia::render('Privacy');
})->name('privacy');

Route::get('/terms', function () {
    return Inertia::render('Terms');
})->name('terms');

Route::get('/support', function () {
    return Inertia::render('Support');
})->name('support');

Route::post('/submit-contact-form', [ContactFormController::class, 'submitContactForm'])->middleware('throttle:3,1')->name('contact-form.submit');


Route::get('/auth/google', [GoogleAuthController::class, 'redirectToGoogle'])->name('auth.google');

Route::get('/auth/google/callback', [GoogleAuthController::class, 'loginWithGoogle']);

Route::get('/dashboard', [DashboardController::class, 'index'])->middleware(['auth', 'verified'])->name('dashboard');

Route::middleware('auth')->group(function () {
    Route::get('/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');
    Route::resource('/loan-detail', LoanDetailController::class);
    Route::get('/api/loan-detail', [ApiLoanDetailController::class, 'index']);
    Route::post('/foreclose-loan', [LoanDetailController::class, 'forecloseLoan']);
    Route::resource('/emi-detail', EmiDetailController::class);
    Route::post('/update-emi', [EmiDetailController::class, 'updateEmi']);
    Route::post('/emi-skipped', [EmiDetailController::class, 'emiSkipped']);
    Route::post('/loan-detail/{loanDetail}/upload-documents', [LoanDetailController::class, 'uploadDocuments'])->name('loan-document.upload');
    Route::get('/loan-document/{loanDocument}/download', [LoanDetailController::class, 'downloadDocument'])->name('loan-document.download');
    Route::delete('/loan-document/{loanDocument}', [LoanDetailController::class, 'destroyDocument'])->name('loan-document.destroy');
});

require __DIR__ . '/auth.php';

// Called by Cloud Scheduler once a day. Authenticated by REMINDER_TOKEN, not by a
// user session. nginx routes this exact path to a separate long-timeout php-fpm
// pool (docker/nginx.conf) because the command sleeps between emails.
Route::post('/internal/send-emi-reminders', ReminderController::class)
    ->name('internal.send-emi-reminders');
