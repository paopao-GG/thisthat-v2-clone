# Redis Setup Script for Windows
# This script helps you set up Redis for the THISTHAT backend

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Redis Setup for THISTHAT Backend" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Redis is already running
Write-Host "Checking if Redis is already running..." -ForegroundColor Yellow
try {
    $redisTest = Test-NetConnection -ComputerName localhost -Port 6379 -InformationLevel Quiet -WarningAction SilentlyContinue
    if ($redisTest) {
        Write-Host "✅ Redis is already running on port 6379!" -ForegroundColor Green
        Write-Host ""
        Write-Host "You can proceed with starting the backend server." -ForegroundColor White
        exit 0
    }
} catch {
    # Port not open, continue
}

Write-Host "Redis is not running. Choose a setup option:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Use Cloud Redis (Upstash - FREE, No Installation)" -ForegroundColor Green
Write-Host "2. Use Docker Desktop (Requires Docker Desktop installed)" -ForegroundColor Cyan
Write-Host "3. Use WSL (Windows Subsystem for Linux)" -ForegroundColor Cyan
Write-Host "4. Skip Redis (System will work but leaderboards will be slower)" -ForegroundColor Yellow
Write-Host ""

$choice = Read-Host "Enter your choice (1-4)"

switch ($choice) {
    "1" {
        Write-Host ""
        Write-Host "=== Cloud Redis Setup (Upstash) ===" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "1. Go to: https://upstash.com/" -ForegroundColor White
        Write-Host "2. Sign up for a free account" -ForegroundColor White
        Write-Host "3. Create a new Redis database" -ForegroundColor White
        Write-Host "4. Copy the Redis URL (looks like: redis://default:password@host:port)" -ForegroundColor White
        Write-Host ""
        $redisUrl = Read-Host "Paste your Redis URL here"
        
        if ($redisUrl) {
            # Update .env file
            $envPath = Join-Path $PSScriptRoot "..\.env"
            if (Test-Path $envPath) {
                $envContent = Get-Content $envPath -Raw
                if ($envContent -match "REDIS_URL=.*") {
                    $envContent = $envContent -replace "REDIS_URL=.*", "REDIS_URL=$redisUrl"
                } else {
                    $envContent += "`nREDIS_URL=$redisUrl"
                }
                Set-Content -Path $envPath -Value $envContent -NoNewline
                Write-Host ""
                Write-Host "✅ Redis URL updated in .env file!" -ForegroundColor Green
            } else {
                Write-Host ""
                Write-Host "⚠️  .env file not found. Please add this line manually:" -ForegroundColor Yellow
                Write-Host "REDIS_URL=$redisUrl" -ForegroundColor White
            }
        }
    }
    
    "2" {
        Write-Host ""
        Write-Host "=== Docker Setup ===" -ForegroundColor Cyan
        Write-Host ""
        
        # Check if Docker is installed
        try {
            $dockerVersion = docker --version 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Host "✅ Docker is installed: $dockerVersion" -ForegroundColor Green
                
                # Check if Docker Desktop is running
                try {
                    docker ps 2>&1 | Out-Null
                    if ($LASTEXITCODE -eq 0) {
                        Write-Host "✅ Docker Desktop is running" -ForegroundColor Green
                        Write-Host ""
                        Write-Host "Starting Redis container..." -ForegroundColor Yellow
                        
                        docker run -d -p 6379:6379 --name thisthat-redis redis:latest
                        
                        if ($LASTEXITCODE -eq 0) {
                            Write-Host ""
                            Write-Host "✅ Redis container started successfully!" -ForegroundColor Green
                            Write-Host ""
                            Write-Host "To stop Redis: docker stop thisthat-redis" -ForegroundColor Gray
                            Write-Host "To start Redis: docker start thisthat-redis" -ForegroundColor Gray
                        } else {
                            Write-Host ""
                            Write-Host "❌ Failed to start Redis container" -ForegroundColor Red
                            Write-Host "Error: $dockerOutput" -ForegroundColor Red
                        }
                    } else {
                        Write-Host "❌ Docker Desktop is not running" -ForegroundColor Red
                        Write-Host ""
                        Write-Host "Please:" -ForegroundColor Yellow
                        Write-Host "1. Start Docker Desktop" -ForegroundColor White
                        Write-Host "2. Wait for it to fully start" -ForegroundColor White
                        Write-Host "3. Run this script again" -ForegroundColor White
                    }
                } catch {
                    Write-Host "❌ Docker Desktop is not running" -ForegroundColor Red
                    Write-Host "Please start Docker Desktop and try again." -ForegroundColor Yellow
                }
            }
        } catch {
            Write-Host "❌ Docker is not installed" -ForegroundColor Red
            Write-Host ""
            Write-Host "Please install Docker Desktop from:" -ForegroundColor Yellow
            Write-Host "https://www.docker.com/products/docker-desktop/" -ForegroundColor Cyan
        }
    }
    
    "3" {
        Write-Host ""
        Write-Host "=== WSL Setup ===" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "To set up Redis in WSL, run these commands in WSL (Ubuntu):" -ForegroundColor White
        Write-Host ""
        Write-Host "sudo apt update" -ForegroundColor Gray
        Write-Host "sudo apt install redis-server -y" -ForegroundColor Gray
        Write-Host "sudo service redis-server start" -ForegroundColor Gray
        Write-Host ""
        Write-Host "Then Redis will be accessible at localhost:6379 from Windows" -ForegroundColor White
    }
    
    "4" {
        Write-Host ""
        Write-Host "=== Skipping Redis ===" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "The system will work without Redis, but:" -ForegroundColor White
        Write-Host "- Leaderboards will be slower (no caching)" -ForegroundColor Yellow
        Write-Host "- All other features will work normally" -ForegroundColor Green
        Write-Host ""
        Write-Host "You can add Redis later by running this script again." -ForegroundColor White
    }
    
    default {
        Write-Host ""
        Write-Host "Invalid choice. Exiting." -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Setup Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

