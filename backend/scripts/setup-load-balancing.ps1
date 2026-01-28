# THISTHAT Load Balancing Setup Script
# Complete setup script for load balancing

param(
    [int]$Instances = 3,
    [switch]$SkipSSL = $false,
    [switch]$SkipMigrations = $false
)

$ErrorActionPreference = "Stop"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "THISTHAT Load Balancing Setup" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Step 1: Check prerequisites
Write-Host "[1/6] Checking Prerequisites..." -ForegroundColor Yellow

# Check Docker
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "  ❌ Docker not found. Please install Docker Desktop." -ForegroundColor Red
    exit 1
}
Write-Host "  ✅ Docker found" -ForegroundColor Green

# Check Docker Compose
if (-not (Get-Command docker-compose -ErrorAction SilentlyContinue)) {
    Write-Host "  ❌ docker-compose not found. Please install Docker Desktop." -ForegroundColor Red
    exit 1
}
Write-Host "  ✅ Docker Compose found" -ForegroundColor Green

# Check Docker is running
try {
    docker ps 2>&1 | Out-Null
    Write-Host "  ✅ Docker is running" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Docker is not running. Please start Docker Desktop." -ForegroundColor Red
    exit 1
}

# Step 2: Setup SSL certificates
Write-Host "`n[2/6] Setting Up SSL Certificates..." -ForegroundColor Yellow

if ($SkipSSL) {
    Write-Host "  ⏭️  Skipping SSL setup (using existing certificates)" -ForegroundColor Gray
} else {
    if (-not (Test-Path "nginx/ssl")) {
        New-Item -ItemType Directory -Path "nginx/ssl" -Force | Out-Null
        Write-Host "  ✅ Created nginx/ssl directory" -ForegroundColor Green
    }
    
    if (-not (Test-Path "nginx/ssl/fullchain.pem") -or -not (Test-Path "nginx/ssl/privkey.pem")) {
        Write-Host "  ⚠️  SSL certificates not found" -ForegroundColor Yellow
        Write-Host "  Generating self-signed certificates (development only)..." -ForegroundColor Gray
        
        # Try PowerShell script first (Windows-friendly, no OpenSSL needed)
        if (Test-Path "scripts/generate-ssl-cert-windows.ps1") {
            Write-Host "  Using PowerShell certificate generator..." -ForegroundColor Gray
            & ".\scripts\generate-ssl-cert-windows.ps1" -Domain "localhost"
            
            if ($LASTEXITCODE -eq 0 -and (Test-Path "nginx/ssl/fullchain.pem") -and (Test-Path "nginx/ssl/privkey.pem")) {
                Write-Host "  ✅ Generated self-signed certificates using PowerShell" -ForegroundColor Green
            } else {
                Write-Host "  ⚠️  PowerShell script failed, trying OpenSSL..." -ForegroundColor Yellow
                # Fall back to OpenSSL if available
                if (Get-Command openssl -ErrorAction SilentlyContinue) {
                    openssl req -x509 -nodes -days 365 -newkey rsa:2048 `
                        -keyout nginx/ssl/privkey.pem `
                        -out nginx/ssl/fullchain.pem `
                        -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
                    
                    Write-Host "  ✅ Generated self-signed certificates using OpenSSL" -ForegroundColor Green
                } else {
                    Write-Host "  ❌ Could not generate certificates. Please run manually:" -ForegroundColor Red
                    Write-Host "     .\scripts\generate-ssl-cert-windows.ps1" -ForegroundColor Yellow
                    Write-Host "  Or install OpenSSL and try again." -ForegroundColor Yellow
                    exit 1
                }
            }
        } elseif (Get-Command openssl -ErrorAction SilentlyContinue) {
            # Fall back to OpenSSL if PowerShell script doesn't exist
            openssl req -x509 -nodes -days 365 -newkey rsa:2048 `
                -keyout nginx/ssl/privkey.pem `
                -out nginx/ssl/fullchain.pem `
                -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
            
            Write-Host "  ✅ Generated self-signed certificates using OpenSSL" -ForegroundColor Green
        } else {
            Write-Host "  ❌ OpenSSL not found and PowerShell script not available." -ForegroundColor Red
            Write-Host "  Please run: .\scripts\generate-ssl-cert-windows.ps1" -ForegroundColor Yellow
            Write-Host "  Or install OpenSSL and try again." -ForegroundColor Yellow
            exit 1
        }
    } else {
        Write-Host "  ✅ SSL certificates found" -ForegroundColor Green
    }
}

# Step 3: Check environment file
Write-Host "`n[3/6] Checking Environment Configuration..." -ForegroundColor Yellow

if (-not (Test-Path ".env")) {
    Write-Host "  ⚠️  .env file not found" -ForegroundColor Yellow
    if (Test-Path "env.template") {
        Copy-Item "env.template" ".env"
        Write-Host "  ✅ Created .env from env.template" -ForegroundColor Green
        Write-Host "  ⚠️  Please update .env with your configuration!" -ForegroundColor Yellow
    } else {
        Write-Host "  ❌ env.template not found" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "  ✅ .env file found" -ForegroundColor Green
}

# Step 4: Build Docker images
Write-Host "`n[4/6] Building Docker Images..." -ForegroundColor Yellow
Write-Host "  This may take a few minutes on first run..." -ForegroundColor Gray

docker-compose build backend

if ($LASTEXITCODE -ne 0) {
    Write-Host "  ❌ Build failed" -ForegroundColor Red
    exit 1
}
Write-Host "  ✅ Images built successfully" -ForegroundColor Green

# Step 5: Start services
Write-Host "`n[5/6] Starting Services..." -ForegroundColor Yellow

Write-Host "  Starting databases and Redis..." -ForegroundColor Gray
docker-compose up -d postgres-markets postgres-users redis

Start-Sleep -Seconds 5

Write-Host "  Starting $Instances backend instance(s)..." -ForegroundColor Gray
docker-compose up -d --scale backend=$Instances

if ($LASTEXITCODE -ne 0) {
    Write-Host "  ❌ Failed to start services" -ForegroundColor Red
    exit 1
}

Write-Host "  ✅ Services started" -ForegroundColor Green

# Wait for services to be healthy
Write-Host "  Waiting for services to be healthy (this may take 30-60 seconds)..." -ForegroundColor Gray
Start-Sleep -Seconds 10

# Step 6: Start Nginx
Write-Host "`n[6/6] Starting Nginx Load Balancer..." -ForegroundColor Yellow

docker-compose up -d nginx

if ($LASTEXITCODE -ne 0) {
    Write-Host "  ❌ Failed to start Nginx" -ForegroundColor Red
    exit 1
}

Write-Host "  ✅ Nginx started" -ForegroundColor Green

# Step 7: Run migrations
if (-not $SkipMigrations) {
    Write-Host "`n[Migrations] Running Database Migrations..." -ForegroundColor Yellow
    
    # Wait a bit more for backend to be ready
    Start-Sleep -Seconds 10
    
    docker-compose exec backend npm run db:push
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✅ Migrations completed" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  Migrations failed (you may need to run manually)" -ForegroundColor Yellow
        Write-Host "  Run: docker-compose exec backend npm run db:push" -ForegroundColor Gray
    }
}

# Final status
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Setup Complete! 🎉" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Services Status:" -ForegroundColor Yellow
docker-compose ps

Write-Host "`n✅ Load balancing is configured with $Instances backend instance(s)" -ForegroundColor Green

Write-Host "`n📊 Quick Commands:" -ForegroundColor Cyan
Write-Host "  Check status:     .\scripts\manage-load-balancing.ps1 -Action status" -ForegroundColor White
Write-Host "  Test load bal:    .\scripts\test-load-balancing.ps1" -ForegroundColor White
Write-Host "  View logs:        docker-compose logs -f backend" -ForegroundColor White
Write-Host "  Scale instances:  docker-compose up -d --scale backend=5" -ForegroundColor White

Write-Host "`n🌐 Access:" -ForegroundColor Cyan
Write-Host "  API: http://localhost/api/v1/health" -ForegroundColor White
Write-Host "  Health: http://localhost/health" -ForegroundColor White

Write-Host "`n📖 Documentation:" -ForegroundColor Cyan
Write-Host "  Quick Start: LOAD_BALANCING_QUICK_START.md" -ForegroundColor White
Write-Host "  Full Guide: docs/LOAD_BALANCING_SETUP.md" -ForegroundColor White

Write-Host "`n"


