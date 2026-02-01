# 🚀 Step-by-Step Guide to Run SveltyCMS

This guide will walk you through running SveltyCMS and logging into the admin panel.

## Prerequisites

Before you begin, make sure you have:

1. **Node.js** (version 20.0.0 or higher)
   - Check your version: `node --version`
   - Download from: https://nodejs.org/

2. **Package Manager** (choose one):
   - **npm** (comes with Node.js)
   - **pnpm** (install with: `npm install -g pnpm`)
   - **bun** (install with: `curl -fsSL https://bun.sh/install | bash`)

3. **MongoDB** (for database)
   - Local MongoDB installation, OR
   - MongoDB Atlas account (free tier available)

---

## Step 1: Install Dependencies

Open your terminal in the project directory and run:

### Using npm:

```bash
npm install
```

### Using pnpm:

```bash
pnpm install
```

### Using bun:

```bash
bun install
```

**Wait for installation to complete** - this may take a few minutes.

---

## Step 2: Start the Development Server

Run the development server:

### Using npm:

```bash
npm run dev
```

### Using pnpm:

```bash
pnpm run dev
```

### Using bun:

```bash
bun run dev
```

**What happens next:**

- The server will start on `http://localhost:5173`
- If this is your first time running the project, the **Setup Wizard will automatically launch**
- The setup wizard will guide you through the initial configuration

---

## Step 3: Complete the Setup Wizard

When you first run the project, you'll be automatically redirected to the setup wizard. Follow these steps:

### 3.1 Database Configuration

1. **Choose Database Type**: Select MongoDB (recommended for first install)
2. **Enter Connection Details**:
   - **For Local MongoDB**:
     - Host: `localhost`
     - Port: `27017`
     - Database Name: `sveltycms` (or your preferred name)
     - Username: (if authentication is enabled)
     - Password: (if authentication is enabled)
   - **For MongoDB Atlas** (Cloud):
     - Connection String: Your MongoDB Atlas connection string
     - Format: `mongodb+srv://username:password@cluster.mongodb.net/database-name`

3. **Test Connection**: Click "Test Connection" to verify your database settings

### 3.2 Create Admin Account

Fill in the admin account details:

- **Username**: Choose a username (3-50 characters)
- **Email**: Enter your email address
- **Password**: Create a strong password that meets these requirements:
  - Minimum 8 characters
  - At least one uppercase letter
  - At least one lowercase letter
  - At least one number
  - At least one special character
- **Confirm Password**: Re-enter your password

**⚠️ IMPORTANT**: Remember these credentials! You'll need them to log in.

### 3.3 Complete Setup

1. Click "Complete Setup" or "Finish"
2. Wait for the system to initialize (this may take a moment)
3. You'll see a success message when setup is complete

---

## Step 4: Login to Admin Panel

After setup is complete:

### 4.1 Navigate to Admin Panel

Open your browser and go to:

```
http://localhost:5173/admin
```

Or simply:

```
http://localhost:5173/login
```

### 4.2 Enter Login Credentials

Use the credentials you created during the setup wizard:

- **Email**: The email address you entered during setup
- **Password**: The password you created during setup

### 4.3 Click "Sign In"

After clicking "Sign In", you'll be redirected to the admin dashboard.

---

## Alternative: Manual Setup (If Setup Wizard Doesn't Launch)

If the setup wizard doesn't launch automatically:

1. **Check if setup is already complete**:
   - Try accessing `http://localhost:5173/admin`
   - If you see a login page, setup may already be complete

2. **Manually trigger setup**:
   - Navigate to: `http://localhost:5173/setup`
   - Follow the setup wizard steps

3. **Check database connection**:
   - Make sure MongoDB is running (if using local MongoDB)
   - Verify your connection string (if using MongoDB Atlas)

---

## Troubleshooting

### Problem: "Database connection failed"

**Solutions:**

- Make sure MongoDB is running (if using local MongoDB)
- Check your connection string/credentials
- Verify MongoDB Atlas network access settings (if using Atlas)
- Check firewall settings

### Problem: "Setup wizard keeps looping"

**Solutions:**

- Clear your browser cache
- Check if admin user already exists in database
- Restart the development server
- Check server logs for errors

### Problem: "Cannot login after setup"

**Solutions:**

- Verify you're using the exact email/password from setup
- Check if the user was created successfully (check database)
- Try resetting password or creating a new admin user
- Check browser console for errors

### Problem: "Port 5173 already in use"

**Solutions:**

- Stop other applications using port 5173
- Or change the port in `vite.config.ts`

---

## Quick Reference

### Default URLs:

- **Admin Panel**: `http://localhost:5173/admin`
- **Login Page**: `http://localhost:5173/login`
- **API Endpoint**: `http://localhost:5173/api`
- **GraphQL**: `http://localhost:5173/api/graphql`
- **Setup Wizard**: `http://localhost:5173/setup`

### Useful Commands:

```bash
# Start development server
npm run dev          # or pnpm run dev / bun run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run tests
npm run test

# Format code
npm run format

# Lint code
npm run lint
```

---

## Next Steps After Login

Once you're logged in:

1. **Explore the Dashboard**: View system metrics and recent activity
2. **Configure Settings**: Go to Settings to customize your CMS
3. **Create Collections**: Start building your content structure
4. **Upload Media**: Add images and files to your media library
5. **Create Content**: Add your first content entries

---

## Need Help?

- 📖 **Documentation**: Check `/docs` folder
- 💬 **Discord**: https://discord.gg/qKQRB6mP
- 🐛 **Issues**: https://github.com/SveltyCMS/SveltyCMS/issues
- 📧 **Email**: support@sveltycms.com

---

**Happy coding! 🎉**
