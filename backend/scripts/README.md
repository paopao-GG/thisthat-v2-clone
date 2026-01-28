# Scripts Directory

This folder contains utility scripts for development, testing, and database management.

## 📜 Available Scripts

### 🧪 Testing Scripts
- **[test-api.ps1](./test-api.ps1)** - PowerShell script to test API endpoints
- **[test-mongodb-connection.js](./test-mongodb-connection.js)** - Test MongoDB connection

### 📊 Database Scripts
- **[view-database.ps1](./view-database.ps1)** - View market and event data from MongoDB
- **[view-events-only.ps1](./view-events-only.ps1)** - View only event data from MongoDB

### ⚙️ Setup Scripts
- **[setup-env.ps1](./setup-env.ps1)** - Interactive PowerShell script to create `.env` file with PostgreSQL credentials

## 🚀 Usage

### Running PowerShell Scripts
```powershell
# From backend directory
.\scripts\setup-env.ps1        # Create .env file interactively
.\scripts\test-api.ps1         # Test API endpoints
.\scripts\view-database.ps1    # View database data
.\scripts\view-events-only.ps1 # View events only
```

### Running Node.js Scripts
```bash
# From backend directory
node scripts/test-mongodb-connection.js
```

## 📝 Notes

- All scripts assume the backend server is running (unless testing connection)
- MongoDB must be running for database scripts
- PowerShell scripts require PowerShell 5.1+ or PowerShell Core

---

**Last Updated:** 2025-01-XX

