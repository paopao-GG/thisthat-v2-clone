# PowerShell script to create PostgreSQL databases on Windows
# Handles cases where psql is not in PATH

Write-Host "Creating PostgreSQL databases for THISTHAT..." -ForegroundColor Cyan

# Database names
$marketsDb = "thisthat_markets"
$usersDb = "thisthat_users"

# Common PostgreSQL installation paths on Windows
$possiblePsqlPaths = @(
    "C:\Program Files\PostgreSQL\16\bin\psql.exe",
    "C:\Program Files\PostgreSQL\15\bin\psql.exe",
    "C:\Program Files\PostgreSQL\14\bin\psql.exe",
    "C:\Program Files\PostgreSQL\13\bin\psql.exe",
    "C:\Program Files (x86)\PostgreSQL\16\bin\psql.exe",
    "C:\Program Files (x86)\PostgreSQL\15\bin\psql.exe",
    "C:\Program Files (x86)\PostgreSQL\14\bin\psql.exe",
    "C:\Program Files (x86)\PostgreSQL\13\bin\psql.exe"
)

# Try to find psql
$psqlPath = $null

# First, try if psql is in PATH
try {
    $null = Get-Command psql -ErrorAction Stop
    $psqlPath = "psql"
    Write-Host "✅ Found psql in PATH" -ForegroundColor Green
} catch {
    Write-Host "⚠️  psql not found in PATH, searching common installation locations..." -ForegroundColor Yellow
    
    # Search common paths
    foreach ($path in $possiblePsqlPaths) {
        if (Test-Path $path) {
            $psqlPath = $path
            Write-Host "✅ Found psql at: $path" -ForegroundColor Green
            break
        }
    }
}

if (-not $psqlPath) {
    Write-Host ""
    Write-Host "❌ PostgreSQL client (psql) not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please choose one of these options:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Option 1: Install PostgreSQL" -ForegroundColor Cyan
    Write-Host "  Download from: https://www.postgresql.org/download/windows/" -ForegroundColor White
    Write-Host "  Make sure to check 'Add to PATH' during installation" -ForegroundColor White
    Write-Host ""
    Write-Host "Option 2: Use Docker" -ForegroundColor Cyan
    Write-Host "  If you have Docker, use the Docker method instead" -ForegroundColor White
    Write-Host ""
    Write-Host "Option 3: Use pgAdmin (GUI)" -ForegroundColor Cyan
    Write-Host "  Open pgAdmin and create databases manually" -ForegroundColor White
    Write-Host ""
    Write-Host "Option 4: Add PostgreSQL to PATH" -ForegroundColor Cyan
    Write-Host "  Find your PostgreSQL installation and add the bin folder to PATH" -ForegroundColor White
    Write-Host "  Example: C:\Program Files\PostgreSQL\16\bin" -ForegroundColor Gray
    Write-Host ""
    
    $useDocker = Read-Host "Do you want to use Docker instead? (y/n)"
    if ($useDocker -eq "y" -or $useDocker -eq "Y") {
        Write-Host ""
        Write-Host "Using Docker method..." -ForegroundColor Cyan
        
        # Check if Docker is available
        try {
            $null = Get-Command docker -ErrorAction Stop
            Write-Host "✅ Docker found" -ForegroundColor Green
            
            $containerName = Read-Host "Enter your PostgreSQL container name (or press Enter for 'postgres')"
            if ([string]::IsNullOrWhiteSpace($containerName)) {
                $containerName = "postgres"
            }
            
            Write-Host ""
            Write-Host "Creating databases using Docker..." -ForegroundColor Cyan
            
            docker exec -it $containerName psql -U postgres -c "CREATE DATABASE $marketsDb;" 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Write-Host "✅ Markets database created" -ForegroundColor Green
            } else {
                Write-Host "⚠️  Markets database may already exist" -ForegroundColor Yellow
            }
            
            docker exec -it $containerName psql -U postgres -c "CREATE DATABASE $usersDb;" 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Write-Host "✅ Users database created" -ForegroundColor Green
            } else {
                Write-Host "⚠️  Users database may already exist" -ForegroundColor Yellow
            }
            
            Write-Host ""
            Write-Host "✅ Databases created via Docker!" -ForegroundColor Green
            exit 0
        } catch {
            Write-Host "❌ Docker not found. Please install Docker Desktop or PostgreSQL." -ForegroundColor Red
            exit 1
        }
    }
    
    exit 1
}

# Get database connection details
Write-Host ""
Write-Host "Database Configuration:" -ForegroundColor Yellow
$dbHost = Read-Host "PostgreSQL host (default: localhost)"
if ([string]::IsNullOrWhiteSpace($dbHost)) { $dbHost = "localhost" }

$dbPort = Read-Host "PostgreSQL port (default: 5432)"
if ([string]::IsNullOrWhiteSpace($dbPort)) { $dbPort = "5432" }

$dbUser = Read-Host "PostgreSQL username (default: postgres)"
if ([string]::IsNullOrWhiteSpace($dbUser)) { $dbUser = "postgres" }

$dbPassword = Read-Host "PostgreSQL password" -AsSecureString
$dbPasswordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($dbPassword)
)

Write-Host ""
Write-Host "Creating databases..." -ForegroundColor Cyan

# Set PGPASSWORD environment variable
$env:PGPASSWORD = $dbPasswordPlain

# Create markets database
Write-Host ""
Write-Host "1. Creating markets database ($marketsDb)..." -ForegroundColor Yellow
$createMarkets = "CREATE DATABASE $marketsDb;"

if ($psqlPath -eq "psql") {
    $result1 = & psql -h $dbHost -p $dbPort -U $dbUser -d postgres -c $createMarkets 2>&1
} else {
    $result1 = & $psqlPath -h $dbHost -p $dbPort -U $dbUser -d postgres -c $createMarkets 2>&1
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ Markets database created successfully" -ForegroundColor Green
} else {
    if ($result1 -match "already exists") {
        Write-Host "   ⚠️  Markets database already exists (skipping)" -ForegroundColor Yellow
    } else {
        Write-Host "   ❌ Error creating markets database:" -ForegroundColor Red
        Write-Host "   $result1" -ForegroundColor Red
    }
}

# Create users database
Write-Host ""
Write-Host "2. Creating users database ($usersDb)..." -ForegroundColor Yellow
$createUsers = "CREATE DATABASE $usersDb;"

if ($psqlPath -eq "psql") {
    $result2 = & psql -h $dbHost -p $dbPort -U $dbUser -d postgres -c $createUsers 2>&1
} else {
    $result2 = & $psqlPath -h $dbHost -p $dbPort -U $dbUser -d postgres -c $createUsers 2>&1
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ Users database created successfully" -ForegroundColor Green
} else {
    if ($result2 -match "already exists") {
        Write-Host "   ⚠️  Users database already exists (skipping)" -ForegroundColor Yellow
    } else {
        Write-Host "   ❌ Error creating users database:" -ForegroundColor Red
        Write-Host "   $result2" -ForegroundColor Red
    }
}

# Clear password from environment
Remove-Item Env:\PGPASSWORD
$dbPasswordPlain = $null

Write-Host ""
Write-Host "✅ Database creation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Update your .env file with:" -ForegroundColor White
Write-Host "     MARKETS_DATABASE_URL=postgresql://$dbUser`:***@$dbHost`:$dbPort/$marketsDb?schema=public" -ForegroundColor Gray
Write-Host "     USERS_DATABASE_URL=postgresql://$dbUser`:***@$dbHost`:$dbPort/$usersDb?schema=public" -ForegroundColor Gray
Write-Host "  2. Run: npm run db:generate" -ForegroundColor White
Write-Host "  3. Run: npm run db:push" -ForegroundColor White

