# PowerShell script to generate self-signed SSL certificates on Windows
# Uses .NET classes - no OpenSSL required

param(
    [string]$Domain = "localhost",
    [int]$DaysValid = 365
)

$ErrorActionPreference = "Stop"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "SSL Certificate Generator (Windows)" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Get the script's directory and resolve backend directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = if ($scriptDir -like "*\scripts") { Split-Path -Parent $scriptDir } else { Get-Location }
$sslDir = Join-Path $backendDir "nginx\ssl"

# Create SSL directory if it doesn't exist
if (-not (Test-Path $sslDir)) {
    New-Item -ItemType Directory -Path $sslDir -Force | Out-Null
    Write-Host "✅ Created directory: $sslDir" -ForegroundColor Green
} else {
    Write-Host "✅ Directory exists: $sslDir" -ForegroundColor Green
}

# Check if certificates already exist
$fullchainPath = Join-Path $sslDir "fullchain.pem"
$privkeyPath = Join-Path $sslDir "privkey.pem"

if ((Test-Path $fullchainPath) -and (Test-Path $privkeyPath)) {
    Write-Host "`n⚠️  SSL certificates already exist!" -ForegroundColor Yellow
    $overwrite = Read-Host "Do you want to overwrite them? (y/n)"
    if ($overwrite -ne "y" -and $overwrite -ne "Y") {
        Write-Host "Skipping certificate generation." -ForegroundColor Gray
        exit 0
    }
}

Write-Host "`nGenerating self-signed certificate for: $Domain" -ForegroundColor Yellow
Write-Host "Valid for: $DaysValid days" -ForegroundColor Gray
Write-Host ""

try {
    $method1Success = $false
    
    # Method 1: Try using New-SelfSignedCertificate (Windows 10+)
    if (Get-Command New-SelfSignedCertificate -ErrorAction SilentlyContinue) {
        try {
            Write-Host "Using New-SelfSignedCertificate cmdlet..." -ForegroundColor Gray
            
            # Create certificate using PowerShell cmdlet
            $cert = New-SelfSignedCertificate `
                -Subject "CN=$Domain" `
                -DnsName $Domain, "localhost", "127.0.0.1" `
                -KeyAlgorithm RSA `
                -KeyLength 2048 `
                -CertStoreLocation "Cert:\CurrentUser\My" `
                -NotAfter (Get-Date).AddDays($DaysValid) `
                -KeyExportPolicy Exportable `
                -KeyUsage DigitalSignature, KeyEncipherment `
                -Type SSLServerAuthentication
            
            $thumbprint = $cert.Thumbprint
            
            # Export certificate to PFX first (temporary)
            $pfxPath = [System.IO.Path]::GetFullPath((Join-Path $sslDir "temp-cert.pfx"))
            $pfxPassword = ConvertTo-SecureString -String "temp-password" -Force -AsPlainText
            Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $pfxPassword | Out-Null
            
            # Convert PFX to PEM using OpenSSL if available
            # Check for OpenSSL in PATH or Git installation
            $opensslExe = $null
            if (Get-Command openssl -ErrorAction SilentlyContinue) {
                $opensslExe = "openssl"
            } else {
                # Check Git installation directory (common location on Windows)
                try {
                    $gitPath = (Get-Command git -ErrorAction SilentlyContinue).Source
                    if ($gitPath) {
                        $gitDir = Split-Path (Split-Path $gitPath)
                        $gitOpenssl = Join-Path $gitDir "usr\bin\openssl.exe"
                        if (Test-Path $gitOpenssl) {
                            $opensslExe = $gitOpenssl
                        }
                    }
                } catch { }
            }
            
            if ($opensslExe) {
                # Use OpenSSL to convert (cleanest method)
                & $opensslExe pkcs12 -in $pfxPath -nocerts -nodes -out $privkeyPath -passin pass:temp-password 2>&1 | Out-Null
                & $opensslExe pkcs12 -in $pfxPath -clcerts -nokeys -out $fullchainPath -passin pass:temp-password 2>&1 | Out-Null
                Remove-Item $pfxPath -Force
                # Remove certificate from store (cleanup)
                Remove-Item "Cert:\CurrentUser\My\$thumbprint" -Force -ErrorAction SilentlyContinue
                $method1Success = $true
            } else {
                # OpenSSL not available - fall back to Method 2
                Write-Host "  ⚠️  OpenSSL not available. Falling back to direct .NET certificate generation..." -ForegroundColor Yellow
                Remove-Item $pfxPath -Force -ErrorAction SilentlyContinue
                Remove-Item "Cert:\CurrentUser\My\$thumbprint" -Force -ErrorAction SilentlyContinue
                $method1Success = $false
            }
        } catch {
            Write-Host "  ⚠️  Method 1 failed: $($_.Exception.Message)" -ForegroundColor Yellow
            Write-Host "  Falling back to Method 2..." -ForegroundColor Yellow
            $method1Success = $false
            # Cleanup any partial files
            if (Test-Path $pfxPath) { Remove-Item $pfxPath -Force -ErrorAction SilentlyContinue }
            if ($thumbprint) { Remove-Item "Cert:\CurrentUser\My\$thumbprint" -Force -ErrorAction SilentlyContinue }
        }
    }
    
    # Method 2: Use .NET directly (fallback for older Windows or if Method 1 failed)
    if (-not $method1Success) {
        # Method 2: Use .NET directly (fallback for older Windows)
        Write-Host "Using .NET certificate generation..." -ForegroundColor Gray
        Add-Type -AssemblyName System.Security
        
        # Create certificate subject
        $subject = "CN=$Domain"
        
        # Create distinguished name
        $dn = New-Object System.Security.Cryptography.X509Certificates.X500DistinguishedName($subject)
        
        # Create RSA key pair (2048 bits)
        $rsa = New-Object System.Security.Cryptography.RSACryptoServiceProvider(2048)
        
        # Create certificate request
        $req = New-Object System.Security.Cryptography.X509Certificates.CertificateRequest($dn, $rsa, [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
        
        # Add extensions
        $req.CertificateExtensions.Add(
            [System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($true, $false, 0, $false)
        )
        
        $req.CertificateExtensions.Add(
            [System.Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new(
                [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature -bor
                [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyEncipherment,
                $false
            )
        )
        
        # Add Subject Alternative Name (SAN) extension
        $sanBuilder = New-Object System.Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder
        $sanBuilder.AddDnsName($Domain)
        $sanBuilder.AddDnsName("localhost")
        $sanBuilder.AddIpAddress([System.Net.IPAddress]::Parse("127.0.0.1"))
        $sanBuilder.AddIpAddress([System.Net.IPAddress]::Parse("::1"))
        $req.CertificateExtensions.Add($sanBuilder.Build())
        
        # Create self-signed certificate
        $notBefore = [DateTimeOffset]::Now
        $notAfter = $notBefore.AddDays($DaysValid)
        $cert = $req.CreateSelfSigned($notBefore, $notAfter)
        
        # Export private key to PEM format
        # Note: ExportRSAPrivateKey() is only available in .NET Core 3.0+ / .NET 5+
        # For .NET Framework, we need to use ExportParameters and convert manually
        # or use the certificate's key if it's accessible
        
        $privateKeyPem = $null
        try {
            # Try .NET Core/.NET 5+ method first
            $certRsa = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($cert)
            if ($certRsa) {
                $exportMethod = $certRsa.GetType().GetMethod("ExportRSAPrivateKey", [System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::Instance)
                if ($exportMethod) {
                    $privateKeyBytes = $exportMethod.Invoke($certRsa, $null)
                    $privateKeyPem = "-----BEGIN RSA PRIVATE KEY-----`n"
                    $privateKeyPem += [Convert]::ToBase64String($privateKeyBytes, [System.Base64FormattingOptions]::InsertLineBreaks)
                    $privateKeyPem += "`n-----END RSA PRIVATE KEY-----"
                }
            }
        } catch { }
        
        # If that didn't work, try using the original RSA object
        if (-not $privateKeyPem) {
            try {
                $exportMethod = $rsa.GetType().GetMethod("ExportRSAPrivateKey", [System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::Instance)
                if ($exportMethod) {
                    $privateKeyBytes = $exportMethod.Invoke($rsa, $null)
                    $privateKeyPem = "-----BEGIN RSA PRIVATE KEY-----`n"
                    $privateKeyPem += [Convert]::ToBase64String($privateKeyBytes, [System.Base64FormattingOptions]::InsertLineBreaks)
                    $privateKeyPem += "`n-----END RSA PRIVATE KEY-----"
                }
            } catch { }
        }
        
        # If still no key, we need OpenSSL or a different approach
        if (-not $privateKeyPem) {
            Write-Host "`n❌ Error: Cannot export private key in PEM format." -ForegroundColor Red
            Write-Host "   This script requires one of the following:" -ForegroundColor Yellow
            Write-Host "   1. OpenSSL installed and in PATH" -ForegroundColor Yellow
            Write-Host "   2. .NET Core 3.0+ or .NET 5+ (for ExportRSAPrivateKey method)" -ForegroundColor Yellow
            Write-Host "`n   To install OpenSSL on Windows:" -ForegroundColor Cyan
            Write-Host "   - Download from: https://slproweb.com/products/Win32OpenSSL.html" -ForegroundColor Cyan
            Write-Host "   - Or use: choco install openssl (if Chocolatey is installed)" -ForegroundColor Cyan
            Write-Host "   - Or use Git Bash (includes OpenSSL)" -ForegroundColor Cyan
            throw "Private key export failed - OpenSSL or .NET Core 3.0+ required"
        }
        
        # Export certificate to PEM format
        $certBytes = $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)
        $certPem = "-----BEGIN CERTIFICATE-----`n"
        $certPem += [Convert]::ToBase64String($certBytes, [System.Base64FormattingOptions]::InsertLineBreaks)
        $certPem += "`n-----END CERTIFICATE-----"
        
        # Write files
        [System.IO.File]::WriteAllText($privkeyPath, $privateKeyPem)
        [System.IO.File]::WriteAllText($fullchainPath, $certPem)
    }
    
    Write-Host "✅ Private key saved: $privkeyPath" -ForegroundColor Green
    Write-Host "✅ Certificate saved: $fullchainPath" -ForegroundColor Green
    
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host "✅ SSL Certificates Generated Successfully!" -ForegroundColor Green
    Write-Host "========================================`n" -ForegroundColor Cyan
    
    # Verify certificate details if we can read it
    if (Test-Path $fullchainPath) {
        $certContent = Get-Content $fullchainPath -Raw
        Write-Host "Certificate Details:" -ForegroundColor Yellow
        Write-Host "  Domain: $Domain" -ForegroundColor White
        Write-Host "  Valid for: $DaysValid days" -ForegroundColor White
        Write-Host "  Location: $fullchainPath" -ForegroundColor White
    }
    
    Write-Host "`n⚠️  Note: This is a self-signed certificate for development only." -ForegroundColor Yellow
    Write-Host "   Your browser will show a security warning. This is expected." -ForegroundColor Gray
    Write-Host "   For production, use certificates from a trusted CA (e.g., Let's Encrypt)." -ForegroundColor Gray
    
} catch {
    Write-Host "`n❌ Error generating certificates:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "`nStack trace:" -ForegroundColor Gray
    Write-Host $_.ScriptStackTrace -ForegroundColor Gray
    exit 1
}

