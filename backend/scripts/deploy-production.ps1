# THISTHAT Production Deployment Script
# Deploys backend with 5 instances for 5000 user capacity

param(
    [int]$BackendInstances = 5,
    [switch]$SkipBuild = $false,
    [switch]$SkipMigrations = $false,
    [switch]$Force = $false
)

$ErrorActionPreference = "Stop"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "THISTHAT Production Deployment" -ForegroundColor Cyan
Write-Host "Optimized for 5,000 Concurrent Users" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Check if .env file exists
if (-not (Test-Path ".env")) {
    Write-Host "[ERROR] .env file not found!" -ForegroundColor Red
    Write-Host "Please copy .env.production.template to .env and configure it first:" -ForegroundColor Yellow
    Write-Host "  cp .env.production.template .env" -ForegroundColor White
    Write-Host "  nano .env" -ForegroundColor White
    exit 1
}

# Verify critical env vars are set
Write-Host "[1/8] Checking Environment Configuration..." -ForegroundColor Yellow

$criticalVars = @(
    "POSTGRES_PASSWORD",
    "JWT_ACCESS_SECRET",
    "JWT_REFRESH_SECRET",
    "X_CLIENT_ID",
    "X_CLIENT_SECRET",
    "FRONTEND_URL"
)

$envContent = Get-Content .env -Raw
$missingVars = @()

foreach ($var in $criticalVars) {
    if ($envContent -notmatch "$var=\w+") {
        $missingVars += $var
    }
}

if ($missingVars.Count -gt 0) {
    Write-Host "  [WARNING] The following environment variables are not set or contain placeholder values:" -ForegroundColor Yellow
    foreach ($var in $missingVars) {
        Write-Host "    - $var" -ForegroundColor Yellow
    }

    if (-not $Force) {
        Write-Host "`n  Please update .env file with production values." -ForegroundColor Yellow
        Write-Host "  Use -Force to deploy anyway (not recommended)." -ForegroundColor Gray
        exit 1
    } else {
        Write-Host "`n  [WARNING] Continuing with placeholder values (-Force flag used)..." -ForegroundColor Yellow
    }
} else {
    Write-Host "  ✅ All critical environment variables are set" -ForegroundColor Green
}

# Stop existing services
Write-Host "`n[2/8] Stopping Existing Services..." -ForegroundColor Yellow
docker-compose down 2>&1 | Out-Null
Write-Host "  ✅ Stopped" -ForegroundColor Green

# Build images (unless skipped)
if (-not $SkipBuild) {
    Write-Host "`n[3/8] Building Docker Images..." -ForegroundColor Yellow
    Write-Host "  This may take a few minutes..." -ForegroundColor Gray

    docker-compose build backend

    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [ERROR] Build failed" -ForegroundColor Red
        exit 1
    }
    Write-Host "  ✅ Build complete" -ForegroundColor Green
} else {
    Write-Host "`n[3/8] Skipping build (-SkipBuild flag)" -ForegroundColor Gray
}

# Start databases and Redis first
Write-Host "`n[4/8] Starting Databases and Redis..." -ForegroundColor Yellow
docker-compose up -d postgres-markets postgres-users redis

if ($LASTEXITCODE -ne 0) {
    Write-Host "  [ERROR] Failed to start databases" -ForegroundColor Red
    exit 1
}

Write-Host "  Waiting for databases to be healthy (30s)..." -ForegroundColor Gray
Start-Sleep -Seconds 30
Write-Host "  ✅ Databases started" -ForegroundColor Green

# Start backend instances
Write-Host "`n[5/8] Starting $BackendInstances Backend Instance(s)..." -ForegroundColor Yellow
docker-compose up -d --scale backend=$BackendInstances backend

if ($LASTEXITCODE -ne 0) {
    Write-Host "  [ERROR] Failed to start backend instances" -ForegroundColor Red
    exit 1
}

Write-Host "  Waiting for backend instances to be healthy (40s)..." -ForegroundColor Gray
Start-Sleep -Seconds 40
Write-Host "  ✅ Backend instances started" -ForegroundColor Green

# Run migrations
if (-not $SkipMigrations) {
    Write-Host "`n[6/8] Running Database Migrations..." -ForegroundColor Yellow

    # Wait a bit more for backend to be fully ready
    Start-Sleep -Seconds 10

    docker-compose exec -T backend npm run db:push

    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✅ Migrations completed" -ForegroundColor Green
    } else {
        Write-Host "  [WARNING] Migrations may have failed" -ForegroundColor Yellow
        Write-Host "  You can run manually: docker-compose exec backend npm run db:push" -ForegroundColor Gray
    }
} else {
    Write-Host "`n[6/8] Skipping migrations (-SkipMigrations flag)" -ForegroundColor Gray
}

# Start NGINX
Write-Host "`n[7/8] Starting NGINX Load Balancer..." -ForegroundColor Yellow
docker-compose up -d nginx

if ($LASTEXITCODE -ne 0) {
    Write-Host "  [ERROR] Failed to start NGINX" -ForegroundColor Red
    exit 1
}

Start-Sleep -Seconds 5
Write-Host "  ✅ NGINX started" -ForegroundColor Green

# Verify deployment
Write-Host "`n[8/8] Verifying Deployment..." -ForegroundColor Yellow

# Check services
$services = docker-compose ps --format json | ConvertFrom-Json
$backendCount = ($services | Where-Object { $_.Service -eq "backend" -and $_.State -eq "running" }).Count

Write-Host "`n  Service Status:" -ForegroundColor White
Write-Host "    Backend instances: $backendCount / $BackendInstances" -ForegroundColor $(if ($backendCount -eq $BackendInstances) { "Green" } else { "Yellow" })

# Test health endpoint
try {
    $health = Invoke-RestMethod -Uri "http://localhost/health" -Method GET -ErrorAction Stop
    Write-Host "    Health endpoint:   ✅ OK (status: $($health.status))" -ForegroundColor Green
} catch {
    Write-Host "    Health endpoint:   ❌ FAILED" -ForegroundColor Red
    Write-Host "    Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test markets endpoint
try {
    $markets = Invoke-RestMethod -Uri "http://localhost/api/v1/markets?limit=1" -Method GET -ErrorAction Stop
    if ($markets.data -and $markets.data.Count -gt 0) {
        Write-Host "    Markets endpoint:  ✅ OK ($($markets.count) markets)" -ForegroundColor Green
    } else {
        Write-Host "    Markets endpoint:  ⚠️  No markets found (run ingestion)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "    Markets endpoint:  ❌ FAILED" -ForegroundColor Red
    Write-Host "    Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Show deployment summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Deployment Complete! 🎉" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  Backend Instances:  $backendCount" -ForegroundColor White
Write-Host "  Target Capacity:    5,000 concurrent users" -ForegroundColor White
Write-Host "  Load Balancing:     NGINX (least_conn)" -ForegroundColor White
Write-Host "  Redis Memory:       512MB" -ForegroundColor White
Write-Host "  Worker Concurrency: 5" -ForegroundColor White

Write-Host "`n🌐 Access URLs:" -ForegroundColor Cyan
Write-Host "  Health:     http://localhost/health" -ForegroundColor White
Write-Host "  Markets:    http://localhost/api/v1/markets" -ForegroundColor White
Write-Host "  Categories: http://localhost/api/v1/markets/categories" -ForegroundColor White

Write-Host "`n📊 Monitoring:" -ForegroundColor Cyan
Write-Host "  View logs:          docker-compose logs -f backend" -ForegroundColor White
Write-Host "  Check status:       docker-compose ps" -ForegroundColor White
Write-Host "  Redis memory:       docker exec thisthat-redis redis-cli INFO memory" -ForegroundColor White
Write-Host "  NGINX access log:   docker exec thisthat-nginx tail -f /var/log/nginx/access.log" -ForegroundColor White

Write-Host "`n🔧 Management:" -ForegroundColor Cyan
Write-Host "  Scale backend:      docker-compose up -d --scale backend=7" -ForegroundColor White
Write-Host "  Restart service:    docker-compose restart backend" -ForegroundColor White
Write-Host "  Stop all:           docker-compose down" -ForegroundColor White

Write-Host "`n⚠️  Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Test category filtering: curl http://localhost/api/v1/markets?category=Politics" -ForegroundColor White
Write-Host "  2. Trigger market ingestion: curl -X POST http://localhost/api/v1/markets/ingest" -ForegroundColor White
Write-Host "  3. Monitor logs for any errors" -ForegroundColor White
Write-Host "  4. Test OAuth login flow" -ForegroundColor White
Write-Host "  5. Run load tests (optional)" -ForegroundColor White

Write-Host "`n📖 Documentation:" -ForegroundColor Cyan
Write-Host "  Production Guide:   PRODUCTION_DEPLOYMENT_READY.md" -ForegroundColor White
Write-Host "  Deployment Guide:   DEPLOYMENT_PLAN/DIGITALOCEAN_DEPLOYMENT_GUIDE.md" -ForegroundColor White
Write-Host "  Scaling Guide:      SCALABILITY_ANALYSIS.md" -ForegroundColor White

Write-Host "`n"
