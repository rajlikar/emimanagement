<?php

namespace Tests\Feature;

use App\Models\LoanDetail;
use App\Models\LoanDocument;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class DocumentUploadTest extends TestCase
{
    use RefreshDatabase;

    private function loanFor(User $user): LoanDetail
    {
        return LoanDetail::factory()->create(['user_id' => $user->id]);
    }

    public function test_uploaded_document_is_stored_and_saved_with_its_real_path(): void
    {
        Storage::fake('public');
        $user = User::factory()->create();
        $loan = $this->loanFor($user);

        $this->actingAs($user)->post(route('loan-document.upload', $loan), [
            'documents' => [['name' => 'Agreement', 'file' => UploadedFile::fake()->create('a.pdf', 20, 'application/pdf')]],
        ])->assertRedirect();

        $doc = LoanDocument::where('loan_details_id', $loan->id)->firstOrFail();

        // The regression: the path used to be saved as "0", giving a /storage/0 link.
        $this->assertNotSame('0', (string) $doc->path);
        $this->assertStringStartsWith('loan_documents/', $doc->path);
        Storage::disk('public')->assertExists($doc->path);
    }

    public function test_a_failed_write_is_not_saved_as_a_document_row(): void
    {
        // Make every write fail the way the GCS mount did: put() returns false.
        Storage::shouldReceive('disk')->with('public')->andReturn(
            \Mockery::mock()->shouldReceive('putFileAs')->andReturn(false)->getMock()
        );
        $this->withoutExceptionHandling();
        $user = User::factory()->create();
        $loan = $this->loanFor($user);

        try {
            $this->actingAs($user)->post(route('loan-document.upload', $loan), [
                'documents' => [['name' => 'Agreement', 'file' => UploadedFile::fake()->create('a.pdf', 20, 'application/pdf')]],
            ]);
            $this->fail('A failed write must raise, not silently succeed.');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('Could not store uploaded document', $e->getMessage());
        }

        $this->assertSame(0, LoanDocument::count(), 'no row may point at a file that was not written');
    }

    public function test_public_disk_has_no_visibility_because_gcs_mounts_reject_chmod(): void
    {
        $this->assertNull(config('filesystems.disks.public.visibility'));
    }

    private function uploadOne(User $user, LoanDetail $loan): LoanDocument
    {
        $this->actingAs($user)->post(route('loan-document.upload', $loan), [
            'documents' => [['name' => 'Agreement', 'file' => UploadedFile::fake()->create('a.pdf', 20, 'application/pdf')]],
        ])->assertRedirect();

        return LoanDocument::where('loan_details_id', $loan->id)->latest('id')->firstOrFail();
    }

    public function test_deleting_a_document_removes_its_file_from_storage(): void
    {
        Storage::fake('public');
        $user = User::factory()->create();
        $loan = $this->loanFor($user);
        $doc = $this->uploadOne($user, $loan);
        Storage::disk('public')->assertExists($doc->path);

        $this->actingAs($user)->delete(route('loan-document.destroy', $doc))->assertRedirect();

        $this->assertDatabaseMissing('loan_documents', ['id' => $doc->id]);
        Storage::disk('public')->assertMissing($doc->path);
    }

    public function test_deleting_a_loan_removes_the_files_of_all_its_documents(): void
    {
        Storage::fake('public');
        $user = User::factory()->create();
        $loan = $this->loanFor($user);
        $one = $this->uploadOne($user, $loan);
        $two = $this->uploadOne($user, $loan);
        $other = $this->uploadOne($user, $this->loanFor($user));   // a different loan: must survive

        $this->actingAs($user)->delete(route('loan-detail.destroy', $loan))->assertRedirect();

        Storage::disk('public')->assertMissing($one->path);
        Storage::disk('public')->assertMissing($two->path);
        Storage::disk('public')->assertExists($other->path);
    }

    public function test_deleting_an_account_removes_its_document_files_but_not_other_users(): void
    {
        Storage::fake('public');
        $user = User::factory()->create();   // factory password is "password"
        $someoneElse = User::factory()->create();
        $mine = $this->uploadOne($user, $this->loanFor($user));
        $theirs = $this->uploadOne($someoneElse, $this->loanFor($someoneElse));

        $this->actingAs($user)->delete('/profile', ['password' => 'password'])->assertRedirect('/');

        $this->assertDatabaseMissing('users', ['id' => $user->id]);
        Storage::disk('public')->assertMissing($mine->path);
        Storage::disk('public')->assertExists($theirs->path);
    }

    public function test_a_missing_file_does_not_block_deleting_the_row(): void
    {
        Storage::fake('public');
        $user = User::factory()->create();
        $loan = $this->loanFor($user);
        $doc = $this->uploadOne($user, $loan);
        Storage::disk('public')->delete($doc->path);   // already gone from the bucket

        $this->actingAs($user)->delete(route('loan-document.destroy', $doc))->assertRedirect();

        $this->assertDatabaseMissing('loan_documents', ['id' => $doc->id]);
    }

    public function test_a_legacy_zero_path_row_can_still_be_deleted(): void
    {
        Storage::fake('public');
        $user = User::factory()->create();
        $loan = $this->loanFor($user);
        $doc = LoanDocument::create(['loan_details_id' => $loan->id, 'document' => 'broken', 'path' => '0']);

        $this->actingAs($user)->delete(route('loan-document.destroy', $doc))->assertRedirect();

        $this->assertDatabaseMissing('loan_documents', ['id' => $doc->id]);
    }
}
