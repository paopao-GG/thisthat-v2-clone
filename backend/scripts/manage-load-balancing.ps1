# THISTHAT Load Balancing Management Script
# Helper script to manage backend scaling and load balancing

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("scale", "status", "logs", "restart", "update", "health")]
    [string]$Action,
    
    [int]$Count = 1,
    [string]$Service = "backend"
)

$ErrorActionPreference = "Stop"

function Show-Status {
    Write-Host "`n📊 Current Status`n" -ForegroundColor Cyan
    
    # Check if docker-compose is available
    if (-not (Get-Command docker-compose -ErrorAction SilentlyContinue)) {
        Write-Host "❌ docker-compose not found" -ForegroundColor Red
        return
    }
    
    # Get all services
    Write-Host "All Services:" -ForegroundColor Yellow
    docker-compose ps
    
    # Get backend instances specifically
    Write-Host "`nBackend Instances:" -ForegroundColor Yellow
    $backendInstances = docker-compose ps $Service 2>$null | Select-String "backend"
    if ($backendInstances) {
        $count = ($backendInstances | Measure-Object).Count
        Write-Host "  ✅ $count instance(s) running" -ForegroundColor Green
        docker-compose ps $Service
    } else {
        Write-Host "  ❌ No backend instances running" -ForegroundColor Red
    }
    
    # Check nginx
    Write-Host "`nNginx Status:" -ForegroundColor Yellow
    $nginxStatus = docker-compose ps nginx 2>$null | Select-String "nginx"
    if ($nginxStatus) {
        Write-Host "  ✅ Nginx is running" -ForegroundColor Green
    } else {
        Write-Host "  ❌ Nginx is not running" -ForegroundColor Red
    }
}

function Scale-Backend {
    param([int]$InstanceCount)
    
    Write-Host "`n🔄 Scaling Backend to $InstanceCount instance(s)`n" -ForegroundColor Cyan
    
    if ($InstanceCount -lt 1) {
        Write-Host "❌ Instance count must be at least 1" -ForegroundColor Red
        return
    }
    
    Write-Host "Scaling backend service..." -ForegroundColor Yellow
    docker-compose up -d --scale $Service=$InstanceCount
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Successfully scaled to $InstanceCount instance(s)" -ForegroundColor Green
        
        # Wait for instances to be healthy
        Write-Host "`nWaiting for instances to be healthy..." -ForegroundColor Yellow
        Start-Sleep -Seconds 5
        
        # Check status
        Show-Status
        
        Write-Host "`n💡 To verify load balancing, run:" -ForegroundColor Cyan
        Write-Host "   .\scripts\test-load-balancing.ps1 -Iterations 20`n" -ForegroundColor White
    } else {
        Write-Host "❌ Failed to scale backend" -ForegroundColor Red
    }
}

function Show-Logs {
    Write-Host "`n📋 Backend Logs`n" -ForegroundColor Cyan
    docker-compose logs -f $Service
}

function Restart-Backend {
    Write-Host "`n🔄 Restarting All Backend Instances`n" -ForegroundColor Cyan
    docker-compose restart $Service
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Backend instances restarted" -ForegroundColor Green
        Show-Status
    } else {
        Write-Host "❌ Failed to restart backend" -ForegroundColor Red
    }
}

function Update-Backend {
    Write-Host "`n🔨 Building and Updating Backend`n" -ForegroundColor Cyan
    
    Write-Host "Building new image..." -ForegroundColor Yellow
    docker-compose build $Service
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Build failed" -ForegroundColor Red
        return
    }
    
    Write-Host "Updating instances..." -ForegroundColor Yellow
    docker-compose up -d --scale $Service=$Count $Service
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Backend updated successfully" -ForegroundColor Green
        Write-Host "   Running $Count instance(s)" -ForegroundColor Gray
        Show-Status
    } else {
        Write-Host "❌ Failed to update backend" -ForegroundColor Red
    }
}

function Check-Health {
    Write-Host "`n🏥 Health Check`n" -ForegroundColor Cyan
    
    # Check backend instances
    $instances = docker-compose ps $Service 2>$null | Select-String "backend" | ForEach-Object { $_ -replace '\s+', ' ' }
    
    if (-not $instances) {
        Write-Host "❌ No backend instances found" -ForegroundColor Red
        return
    }
    
    Write-Host "Checking backend health endpoints..." -ForegroundColor Yellow
    
    $healthy = 0
    $unhealthy = 0
    
    foreach ($instance in $instances) {
        $containerName = ($instance -split ' ')[0]
        
        # Check container health
        $healthStatus = docker inspect --format='{{.State.Health.Status}}' $containerName 2>$null
        
        if ($healthStatus -eq "healthy") {
            Write-Host "  ✅ $containerName - Healthy" -ForegroundColor Green
            $healthy++
        } elseif ($healthStatus -eq "unhealthy") {
            Write-Host "  ❌ $containerName - Unhealthy" -ForegroundColor Red
            $unhealthy++
        } else {
            Write-Host "  ⚠️  $containerName - Starting/Unknown" -ForegroundColor Yellow
        }
    }
    
    Write-Host "`nSummary: $healthy healthy, $unhealthy unhealthy" -ForegroundColor $(if ($unhealthy -eq 0) { "Green" } else { "Yellow" })
    
    # Test nginx endpoint
    Write-Host "`nTesting through Nginx..." -ForegroundColor Yellow
    try {
        $response = Invoke-RestMethod -Uri "http://localhost/api/v1/health" -Method GET -ErrorAction Stop
        Write-Host "  ✅ Nginx can reach backend - Status: $($response.status)" -ForegroundColor Green
    } catch {
        Write-Host "  ❌ Cannot reach backend through Nginx: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Main execution
switch ($Action) {
    "scale" {
        Scale-Backend -InstanceCount $Count
    }
    "status" {
        Show-Status
    }
    "logs" {
        Show-Logs
    }
    "restart" {
        Restart-Backend
    }
    "update" {
        Update-Backend
    }
    "health" {
        Check-Health
    }
    default {
        Write-Host "Unknown action: $Action" -ForegroundColor Red
        Write-Host "`nUsage:" -ForegroundColor Yellow
        Write-Host "  .\scripts\manage-load-balancing.ps1 -Action scale -Count 3" -ForegroundColor White
        Write-Host "  .\scripts\manage-load-balancing.ps1 -Action status" -ForegroundColor White
        Write-Host "  .\scripts\manage-load-balancing.ps1 -Action logs" -ForegroundColor White
        Write-Host "  .\scripts\manage-load-balancing.ps1 -Action restart" -ForegroundColor White
        Write-Host "  .\scripts\manage-load-balancing.ps1 -Action update -Count 3" -ForegroundColor White
        Write-Host "  .\scripts\manage-load-balancing.ps1 -Action health" -ForegroundColor White
    }
}




