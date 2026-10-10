<#
    EMIManagement -> Google Cloud Run deploy script.

    Run from PowerShell (NOT Git Bash):

        cd D:\MyData\Coding\Personal\emimanagement
        .\scripts\deploy.ps1

    Why a script instead of pasting commands:

      * Git Bash (MINGW64) rewrites Unix-looking arguments into Windows paths, so
        `mount-path=/var/www/...` arrives as `C:/Program Files/Git/var/www/...` and
        the deploy fails with "should be a valid unix absolute path".
      * The usual workaround, MSYS_NO_PATHCONV=1, breaks gcloud itself on Windows:
        gcloud's launcher is a shell script that depends on that same conversion to
        locate gcloud.py, so it dies with "can't open file 'D:\c\Users\...'".
      * Long multi-line commands get visually mangled when pasted into MINGW64,
        silently corrupting the arguments.

    PowerShell does no path conversion at all, and a script is not pasted, so none
    of the above applies.

    This script is idempotent: re-running it updates the existing service and job
    rather than failing.
#>

[CmdletBinding()]
param(
    # Image tag to deploy. Defaults to the current git short SHA if that image
    # exists in Artifact Registry, otherwise "latest".
    [string]$Tag,

    # Skip the database migration job (e.g. redeploying with no schema change).
    [switch]$SkipMigrate,

    # Print the resolved gcloud commands without executing them.
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Configuration - these are resource identifiers, not secrets.
# ---------------------------------------------------------------------------
$ProjectId  = 'project-48afcf4c-7480-4a2c-bd0'
$Region     = 'asia-south1'
$Service    = 'emipro'
$MigrateJob = 'emipro-migrate'
$Repo       = 'emi-repo'
$Bucket     = 'emipro-uploads-48afcf4c'
$RunSa      = "emipro-run@$ProjectId.iam.gserviceaccount.com"
$SqlConn    = "${ProjectId}:${Region}:emipro-sql"
$ImageBase  = "$Region-docker.pkg.dev/$ProjectId/$Repo/emimanagement"

# The container mount point for the GCS bucket. Must match the path Laravel's
# "public" disk writes to (config/filesystems.php -> storage_path('app/public')).
$MountPath  = '/var/www/html/storage/app/public'

function Write-Step($n, $text) {
    Write-Host ""
    Write-Host "=== [$n] $text " -ForegroundColor Cyan
}

function Invoke-Gcloud {
    param([string[]]$Arguments, [string]$What)

    if ($DryRun) {
        Write-Host "gcloud $($Arguments -join ' ')" -ForegroundColor DarkGray
        return ''
    }

    # Native exe call. PowerShell quotes array elements containing spaces, so
    # values like "APP_NAME=EMI Management" survive intact.
    $output = & gcloud @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$What failed (gcloud exit code $LASTEXITCODE)."
    }
    return $output
}

# ---------------------------------------------------------------------------
# [0] Guard: refuse to run against the wrong account or project.
# ---------------------------------------------------------------------------
Write-Step 0 'Verifying active account and project'

$activeAccount = (& gcloud config get-value account).Trim()
$activeProject = (& gcloud config get-value project).Trim()

Write-Host "  account : $activeAccount"
Write-Host "  project : $activeProject"
Write-Host "  region  : $Region"

if ($activeProject -ne $ProjectId) {
    throw "REFUSING TO DEPLOY: active project is '$activeProject', expected '$ProjectId'. Run: gcloud config configurations activate emipro"
}
if ([string]::IsNullOrWhiteSpace($activeAccount)) {
    throw "No active gcloud account. Run: gcloud auth login"
}

# ---------------------------------------------------------------------------
# [1] Resolve the image tag.
# ---------------------------------------------------------------------------
Write-Step 1 'Resolving image tag'

if (-not $Tag) {
    $gitSha = (& git rev-parse --short HEAD).Trim()
    $tags = & gcloud artifacts docker tags list $ImageBase --format='value(tag)' --project=$ProjectId
    if ($tags -contains $gitSha) {
        $Tag = $gitSha
        Write-Host "  using git SHA tag: $Tag"
    } else {
        $Tag = 'latest'
        Write-Host "  git SHA '$gitSha' not found in registry; falling back to: $Tag" -ForegroundColor Yellow
    }
} else {
    Write-Host "  using explicit tag: $Tag"
}

$Image = "${ImageBase}:${Tag}"
Write-Host "  image: $Image"

# ---------------------------------------------------------------------------
# [2] Environment variables and secrets.
# ---------------------------------------------------------------------------
# Plain configuration. Nothing sensitive belongs here - env vars are readable by
# anyone with roles/run.viewer.
#
# APP_URL is deliberately absent: it is not knowable until the service exists,
# and is set in step [4] once Cloud Run has assigned a URL.
$envPairs = @(
    'APP_NAME=EMI Management'
    'APP_ENV=production'
    'APP_DEBUG=false'
    'APP_TIMEZONE=Asia/Kolkata'
    'APP_LOCALE=en'
    'LOG_CHANNEL=stderr'
    'LOG_LEVEL=warning'
    'DB_CONNECTION=mysql'
    "DB_SOCKET=/cloudsql/$SqlConn"
    'DB_DATABASE=emimanagement'
    'DB_USERNAME=emiapp'
    'SESSION_DRIVER=database'
    'SESSION_LIFETIME=120'
    'SESSION_SECURE_COOKIE=true'
    'CACHE_STORE=database'
    'QUEUE_CONNECTION=sync'
    'FILESYSTEM_DISK=public'
    'MAIL_MAILER=smtp'
    'MAIL_HOST=smtp.mailgun.org'
    'MAIL_PORT=587'
    'MAIL_ENCRYPTION=tls'
    'MAIL_FROM_ADDRESS=no-reply@akktechnology.org'
    'MAIL_FROM_NAME=EMI Management'
    'TURNSTILE_SITE_KEY=0x4AAAAAACK5F8rD67apEfVP'
)
$envVars = $envPairs -join ','

# Secret Manager. ":latest" resolves when an instance starts, so adding a new
# secret version requires a new revision before running instances pick it up.
$secretPairs = @(
    'APP_KEY=APP_KEY:latest'
    'DB_PASSWORD=DB_PASSWORD:latest'
    'GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID:latest'
    'GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest'
    'MAIL_USERNAME=MAIL_USERNAME:latest'
    'MAIL_PASSWORD=MAIL_PASSWORD:latest'
    'TURNSTILE_SECRET_KEY=TURNSTILE_SECRET_KEY:latest'
)
$secrets = $secretPairs -join ','

# ---------------------------------------------------------------------------
# [3] Deploy the service.
# ---------------------------------------------------------------------------
Write-Step 3 "Deploying Cloud Run service '$Service'"

$deployArgs = @(
    'run', 'deploy', $Service
    "--project=$ProjectId"
    "--image=$Image"
    "--region=$Region"
    '--platform=managed'
    '--allow-unauthenticated'
    "--service-account=$RunSa"
    '--port=8080'
    '--cpu=1'
    '--memory=512Mi'
    '--concurrency=10'
    '--timeout=120'
    '--min-instances=0'      # required for the Cloud Run always-free tier
    '--max-instances=3'      # hard cost ceiling
    '--execution-environment=gen2'   # required for Cloud Storage volume mounts
    "--add-cloudsql-instances=$SqlConn"
    "--add-volume=name=uploads,type=cloud-storage,bucket=$Bucket"
    "--add-volume-mount=volume=uploads,mount-path=$MountPath"
    '--set-env-vars', $envVars
    '--set-secrets', $secrets
    '--quiet'
)

Invoke-Gcloud -Arguments $deployArgs -What 'Deploy' | Out-Null
Write-Host "  deployed." -ForegroundColor Green

# ---------------------------------------------------------------------------
# [4] Capture the URL and set APP_URL.
# ---------------------------------------------------------------------------
Write-Step 4 'Setting APP_URL to the assigned service URL'

if ($DryRun) {
    $ServiceUrl = 'https://DRYRUN.example.run.app'
} else {
    $ServiceUrl = (& gcloud run services describe $Service --project=$ProjectId --region=$Region --format='value(status.url)').Trim()
}
Write-Host "  service URL: $ServiceUrl"

# --update-env-vars MERGES. Using --set-env-vars here would wipe every other
# variable set in step [3].
Invoke-Gcloud -Arguments @(
    'run', 'services', 'update', $Service
    "--project=$ProjectId"
    "--region=$Region"
    '--update-env-vars', "APP_URL=$ServiceUrl,GOOGLE_REDIRECT_URL=$ServiceUrl/auth/google/callback"
    '--quiet'
) -What 'APP_URL update' | Out-Null

Write-Host "  APP_URL set." -ForegroundColor Green

# ---------------------------------------------------------------------------
# [5] Migrations, as a one-off Job.
# ---------------------------------------------------------------------------
# Never migrate from the web container's entrypoint: during a rollout several
# instances boot at once and Laravel's migrator takes no distributed lock, so
# they race on the `migrations` table. A Job runs exactly once.
if (-not $SkipMigrate) {
    Write-Step 5 "Creating/updating migration job '$MigrateJob'"

    # CACHE_STORE/SESSION_DRIVER are 'array' on purpose: the job must not depend
    # on the cache/sessions tables, which do not exist before the first migrate.
    $jobEnv = @(
        'APP_ENV=production'
        'APP_DEBUG=false'
        'LOG_CHANNEL=stderr'
        'DB_CONNECTION=mysql'
        "DB_SOCKET=/cloudsql/$SqlConn"
        'DB_DATABASE=emimanagement'
        'DB_USERNAME=emiapp'
        'CACHE_STORE=array'
        'SESSION_DRIVER=array'
    ) -join ','

    $existingJobs = & gcloud run jobs list --project=$ProjectId --region=$Region --format='value(metadata.name)'
    $verb = 'create'
    if ($existingJobs -contains $MigrateJob) { $verb = 'update' }
    Write-Host "  job exists: $($verb -eq 'update')  ->  gcloud run jobs $verb"

    $jobArgs = @(
        'run', 'jobs', $verb, $MigrateJob
        "--project=$ProjectId"
        "--region=$Region"
        "--image=$Image"
        "--service-account=$RunSa"
        "--set-cloudsql-instances=$SqlConn"
        '--command=php'
        '--args=artisan,migrate,--force'
        '--max-retries=1'
        '--task-timeout=600'
        '--set-env-vars', $jobEnv
        '--set-secrets', 'APP_KEY=APP_KEY:latest,DB_PASSWORD=DB_PASSWORD:latest'
        '--quiet'
    )
    Invoke-Gcloud -Arguments $jobArgs -What "Job $verb" | Out-Null

    Write-Step 6 'Running database migrations'
    Invoke-Gcloud -Arguments @(
        'run', 'jobs', 'execute', $MigrateJob
        "--project=$ProjectId"
        "--region=$Region"
        '--wait'
    ) -What 'Migration' | Out-Null

    Write-Host "  migrations applied." -ForegroundColor Green
} else {
    Write-Step 5 'Skipping migrations (-SkipMigrate)'
}

# ---------------------------------------------------------------------------
# [7] Smoke test.
# ---------------------------------------------------------------------------
Write-Step 7 'Smoke testing'

# Invoke-WebRequest is NOT usable here. In PowerShell 5.1, -MaximumRedirection 0
# raises on a 3xx in a way that does not reliably expose the status code, so a
# perfectly correct 302 was being reported as "0  FAIL".
#
# HttpWebRequest with AllowAutoRedirect = $false returns 3xx as a normal
# response, and surfaces 4xx/5xx through WebException.Response.
function Get-HttpStatus {
    param([string]$Url)

    $req = [System.Net.HttpWebRequest]::Create($Url)
    $req.AllowAutoRedirect = $false
    $req.Method = 'GET'
    $req.Timeout = 60000
    $req.UserAgent = 'emipro-deploy-smoke-test'
    try {
        $resp = $req.GetResponse()
        $result = [pscustomobject]@{ Code = [int]$resp.StatusCode; Location = $resp.Headers['Location'] }
        $resp.Close()
        return $result
    } catch [System.Net.WebException] {
        if ($_.Exception.Response) {
            $r = $_.Exception.Response
            $result = [pscustomobject]@{ Code = [int]$r.StatusCode; Location = $r.Headers['Location'] }
            $r.Close()
            return $result
        }
        return [pscustomobject]@{ Code = 0; Location = $null }
    }
}

if (-not $DryRun) {
    # PowerShell 5.1 can default to TLS 1.0, which Cloud Run rejects.
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    # /up        -> Laravel's built-in health route (bootstrap/app.php health: '/up')
    # /          -> public welcome page; proves Inertia + Vite assets resolve
    # /dashboard -> expect 302 to /login when unauthenticated
    # /login     -> proves the session/database path works
    $checks = @(
        @{ Path = '/up';        Want = 200 }
        @{ Path = '/';          Want = 200 }
        @{ Path = '/login';     Want = 200 }
        @{ Path = '/dashboard'; Want = 302 }
    )
    $failed = $false

    foreach ($c in $checks) {
        $r = Get-HttpStatus -Url "$ServiceUrl$($c.Path)"
        if ($r.Code -eq $c.Want) {
            Write-Host ("  {0,-12} {1}  (expected {2})  OK" -f $c.Path, $r.Code, $c.Want) -ForegroundColor Green
        } else {
            Write-Host ("  {0,-12} {1}  (expected {2})  FAIL" -f $c.Path, $r.Code, $c.Want) -ForegroundColor Red
            $failed = $true
        }

        # A redirect to http:// means trusted proxies are not configured, which
        # silently breaks signed URLs (password reset, email verification) and
        # secure session cookies. See bootstrap/app.php trustProxies().
        if ($r.Location) {
            if ($r.Location.StartsWith('https://')) {
                Write-Host ("               -> {0}  (https OK - trusted proxies working)" -f $r.Location) -ForegroundColor DarkGray
            } else {
                Write-Host ("               -> {0}  (NOT https - check trustProxies in bootstrap/app.php)" -f $r.Location) -ForegroundColor Red
                $failed = $true
            }
        }
    }

    Write-Host ""
    if ($failed) {
        Write-Host "Smoke test FAILED. Inspect errors with:" -ForegroundColor Red
        $q = 'resource.type="cloud_run_revision" AND resource.labels.service_name="' + $Service + '" AND severity>=ERROR'
        Write-Host ("  gcloud logging read '{0}' --project={1} --limit=20" -f $q, $ProjectId) -ForegroundColor Yellow
    } else {
        Write-Host "All checks passed." -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "Service URL: $ServiceUrl" -ForegroundColor Cyan
Write-Host ""
Write-Host "Remaining manual step: register the Google OAuth redirect URI" -ForegroundColor Yellow
Write-Host "  $ServiceUrl/auth/google/callback"
Write-Host "  (Console -> APIs & Services -> Credentials). Until then, Google sign-in fails."
