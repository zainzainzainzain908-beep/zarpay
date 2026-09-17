import http from "http";
import fs from "fs";
import url from "url";

const PORT = process.env.PORT || 3000;
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "changeme123";

let activeSessions = new Map();

// Simple session management
function generateToken() {
  return Math.random().toString(36).slice(2);
}

function verifySession(token) {
  return activeSessions.has(token) && Date.now() - activeSessions.get(token) < 86400000; // 24h
}

// Proxy requests to backend
async function proxyRequest(path, method = "GET", body = null) {
  try {
    const options = {
      method,
      headers: { "Content-Type": "application/json" },
    };
    
    const res = await fetch(`${BACKEND_URL}${path}`, {
      ...options,
      body: body ? JSON.stringify(body) : null,
    });
    
    return await res.json();
  } catch (err) {
    return { error: `Failed to reach backend: ${err.message}` };
  }
}

// HTML Dashboard UI
function getDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Zarpay Admin Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0f172a;
      color: #e2e8f0;
    }
    .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px;
      background: #1e293b;
      border-radius: 8px;
      margin-bottom: 30px;
      border: 1px solid #334155;
    }
    h1 { font-size: 28px; font-weight: 600; }
    .user-info { text-align: right; font-size: 14px; }
    .logout-btn {
      background: #dc2626;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      margin-top: 8px;
    }
    .logout-btn:hover { background: #b91c1c; }
    
    .nav-tabs {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
      border-bottom: 1px solid #334155;
      padding-bottom: 0;
    }
    .nav-tab {
      padding: 12px 20px;
      background: none;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      border-bottom: 2px solid transparent;
      transition: all 0.3s;
    }
    .nav-tab.active {
      color: #60a5fa;
      border-bottom-color: #60a5fa;
    }
    
    .section {
      display: none;
      animation: fadeIn 0.3s;
    }
    .section.active { display: block; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
    }
    
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .stat-box {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
    }
    .stat-value { font-size: 32px; font-weight: 700; color: #60a5fa; }
    .stat-label { font-size: 14px; color: #94a3b8; margin-top: 8px; }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    th {
      background: #0f172a;
      padding: 12px;
      text-align: left;
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      color: #94a3b8;
      border-bottom: 1px solid #334155;
    }
    td {
      padding: 12px;
      border-bottom: 1px solid #334155;
    }
    tr:hover { background: #334155; }
    
    .btn {
      padding: 8px 12px;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      transition: all 0.3s;
    }
    .btn-primary { background: #3b82f6; color: white; }
    .btn-primary:hover { background: #2563eb; }
    .btn-danger { background: #ef4444; color: white; }
    .btn-danger:hover { background: #dc2626; }
    .btn-success { background: #10b981; color: white; }
    .btn-success:hover { background: #059669; }
    
    .form-group {
      margin-bottom: 15px;
    }
    label {
      display: block;
      margin-bottom: 5px;
      font-weight: 500;
      font-size: 14px;
    }
    input, select, textarea {
      width: 100%;
      padding: 10px;
      border: 1px solid #334155;
      border-radius: 6px;
      background: #0f172a;
      color: #e2e8f0;
      font-family: inherit;
    }
    input:focus, select:focus, textarea:focus {
      outline: none;
      border-color: #60a5fa;
      box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.1);
    }
    
    .alert {
      padding: 12px;
      border-radius: 6px;
      margin-bottom: 20px;
      font-size: 14px;
    }
    .alert-success { background: #10b981; color: white; }
    .alert-error { background: #ef4444; color: white; }
    .alert-info { background: #3b82f6; color: white; }
    
    .loading {
      text-align: center;
      padding: 40px;
      color: #94a3b8;
    }
    .spinner {
      display: inline-block;
      width: 40px;
      height: 40px;
      border: 3px solid #334155;
      border-top-color: #60a5fa;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>💳 Zarpay Admin Dashboard</h1>
      <div class="user-info">
        <div>Logged in as Admin</div>
        <button class="logout-btn" onclick="logout()">Logout</button>
      </div>
    </header>

    <div class="nav-tabs">
      <button class="nav-tab active" onclick="switchTab('dashboard')">📊 Dashboard</button>
      <button class="nav-tab" onclick="switchTab('transactions')">💸 Transactions</button>
      <button class="nav-tab" onclick="switchTab('accounts')">👥 Accounts</button>
      <button class="nav-tab" onclick="switchTab('ledger')">📖 Ledger</button>
      <button class="nav-tab" onclick="switchTab('features')">⚙️ Features</button>
    </div>

    <!-- Dashboard Section -->
    <div id="dashboard" class="section active">
      <div class="stats" id="statsContainer">
        <div class="loading"><div class="spinner"></div></div>
      </div>
      <div class="card">
        <h2>System Status</h2>
        <div id="systemStatus" style="margin-top: 15px;"></div>
      </div>
    </div>

    <!-- Transactions Section -->
    <div id="transactions" class="section">
      <div class="card">
        <h2>Recent Transactions</h2>
        <div id="transactionsContent"></div>
      </div>
    </div>

    <!-- Accounts Section -->
    <div id="accounts" class="section">
      <div class="card">
        <h2>User Accounts</h2>
        <button class="btn btn-primary" onclick="showAddUserForm()">+ Add Account</button>
        <div id="addUserForm" style="margin-top: 20px; display: none;">
          <div class="form-group">
            <label>User ID</label>
            <input type="text" id="newUserId" placeholder="user123">
          </div>
          <div class="form-group">
            <label>Account Name</label>
            <input type="text" id="newUserName" placeholder="John Doe">
          </div>
          <div class="form-group">
            <label>Initial Balance</label>
            <input type="number" id="newUserBalance" placeholder="0" value="0">
          </div>
          <button class="btn btn-success" onclick="createAccount()">Create Account</button>
          <button class="btn" style="background: #475569;" onclick="document.getElementById('addUserForm').style.display='none'">Cancel</button>
        </div>
        <div id="accountsContent" style="margin-top: 20px;"></div>
      </div>
    </div>

    <!-- Ledger Section -->
    <div id="ledger" class="section">
      <div class="card">
        <h2>Ledger Proof</h2>
        <button class="btn btn-primary" onclick="loadLedgerProof()">📋 Verify Ledger</button>
        <pre id="ledgerProofContent" style="margin-top: 15px; background: #0f172a; padding: 15px; border-radius: 6px; overflow-x: auto; font-size: 12px; color: #10b981;"></pre>
      </div>
    </div>

    <!-- Features Section -->
    <div id="features" class="section">
      <div class="card">
        <h2>Feature Controls</h2>
        <div id="featuresContent" style="margin-top: 20px;"></div>
      </div>
    </div>

    <div id="alerts"></div>
  </div>

  <script>
    const token = localStorage.getItem('adminToken');
    
    if (!token) {
      showLoginPage();
    } else {
      loadDashboard();
    }

    function showLoginPage() {
      document.body.innerHTML = \`
        <div style="display: flex; align-items: center; justify-content: center; height: 100vh; background: #0f172a;">
          <div style="background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 40px; width: 100%; max-width: 400px;">
            <h2 style="margin-bottom: 30px; text-align: center; color: #60a5fa;">Zarpay Admin</h2>
            <div class="form-group">
              <label>Admin Password</label>
              <input type="password" id="password" placeholder="Enter admin password" onkeypress="if(event.key==='Enter') login()">
            </div>
            <button class="btn btn-primary" onclick="login()" style="width: 100%; padding: 10px;">Login</button>
          </div>
        </div>
      \`;
      document.querySelector('style').textContent += \`
        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; font-weight: 500; font-size: 14px; }
        input { width: 100%; padding: 10px; border: 1px solid #334155; border-radius: 6px; background: #0f172a; color: #e2e8f0; font-family: inherit; }
      \`;
    }

    function login() {
      const password = document.getElementById('password').value;
      fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) })
        .then(r => r.json())
        .then(data => {
          if (data.token) {
            localStorage.setItem('adminToken', data.token);
            location.reload();
          } else {
            alert('Invalid password');
          }
        });
    }

    function logout() {
      localStorage.removeItem('adminToken');
      location.reload();
    }

    async function loadDashboard() {
      loadStats();
      loadSystemStatus();
      switchTab('dashboard');
    }

    async function loadStats() {
      const container = document.getElementById('statsContainer');
      try {
        const data = await fetchAPI('/api/stats');
        container.innerHTML = \`
          <div class="stat-box">
            <div class="stat-value">\${data.totalAccounts || 0}</div>
            <div class="stat-label">Total Accounts</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">\${data.totalTransactions || 0}</div>
            <div class="stat-label">Total Transactions</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">₨\${(data.totalVolume || 0).toLocaleString()}</div>
            <div class="stat-label">Total Volume</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">\${data.systemHealth || 'Healthy'}%</div>
            <div class="stat-label">System Health</div>
          </div>
        \`;
      } catch (e) {
        container.innerHTML = '<div class="alert alert-error">Failed to load stats</div>';
      }
    }

    async function loadSystemStatus() {
      try {
        const data = await fetchAPI('/api/status');
        const status = document.getElementById('systemStatus');
        status.innerHTML = \`
          <p>✅ Backend: Connected</p>
          <p>⏱️ Uptime: \${data.uptime || 'N/A'}</p>
          <p>💾 Memory: \${data.memory || 'N/A'}</p>
          <p>🔌 Connections: \${data.connections || 0}</p>
        \`;
      } catch (e) {
        document.getElementById('systemStatus').innerHTML = '<div class="alert alert-error">Backend unreachable</div>';
      }
    }

    async function switchTab(tab) {
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      document.getElementById(tab).classList.add('active');
      event.target.classList.add('active');
      
      if (tab === 'transactions') loadTransactions();
      if (tab === 'accounts') loadAccounts();
    }

    async function loadTransactions() {
      const container = document.getElementById('transactionsContent');
      container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
      try {
        const data = await fetchAPI('/api/transactions');
        const transactions = data.transactions || [];
        if (transactions.length === 0) {
          container.innerHTML = '<p style="color: #94a3b8;">No transactions yet</p>';
          return;
        }
        let html = '<table><thead><tr><th>ID</th><th>From</th><th>To</th><th>Amount</th><th>Date</th><th>Status</th></tr></thead><tbody>';
        transactions.slice(0, 50).forEach(t => {
          html += \`<tr><td>\${t.id || 'N/A'}</td><td>\${t.from || 'N/A'}</td><td>\${t.to || 'N/A'}</td><td>₨\${t.amount || 0}</td><td>\${new Date(t.date).toLocaleString()}</td><td><span style="color: #10b981;">✓ Complete</span></td></tr>\`;
        });
        html += '</tbody></table>';
        container.innerHTML = html;
      } catch (e) {
        container.innerHTML = '<div class="alert alert-error">Failed to load transactions</div>';
      }
    }

    async function loadAccounts() {
      const container = document.getElementById('accountsContent');
      container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
      try {
        const data = await fetchAPI('/api/accounts');
        const accounts = data.accounts || [];
        if (accounts.length === 0) {
          container.innerHTML = '<p style="color: #94a3b8;">No accounts yet</p>';
          return;
        }
        let html = '<table><thead><tr><th>ID</th><th>Name</th><th>Balance</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
        accounts.forEach(acc => {
          html += \`<tr><td>\${acc.id}</td><td>\${acc.name || 'N/A'}</td><td>₨\${(acc.balance || 0).toLocaleString()}</td><td><span style="color: #10b981;">✓ Active</span></td><td><button class="btn btn-danger" onclick="deleteAccount('\${acc.id}')">Delete</button></td></tr>\`;
        });
        html += '</tbody></table>';
        container.innerHTML = html;
      } catch (e) {
        container.innerHTML = '<div class="alert alert-error">Failed to load accounts</div>';
      }
    }

    async function loadLedgerProof() {
      const container = document.getElementById('ledgerProofContent');
      container.textContent = 'Loading...';
      try {
        const data = await fetchAPI('/api/ledger/proof');
        container.textContent = JSON.stringify(data, null, 2);
        showAlert('Ledger verified ✓', 'success');
      } catch (e) {
        container.textContent = 'Failed to load ledger proof';
        showAlert('Failed to verify ledger', 'error');
      }
    }

    function showAddUserForm() {
      document.getElementById('addUserForm').style.display = 'block';
    }

    async function createAccount() {
      const userId = document.getElementById('newUserId').value;
      const userName = document.getElementById('newUserName').value;
      const balance = parseFloat(document.getElementById('newUserBalance').value);
      
      if (!userId || !userName) {
        showAlert('Please fill all fields', 'error');
        return;
      }
      
      try {
        await fetchAPI('/api/accounts', { userId, userName, balance }, 'POST');
        showAlert('Account created successfully', 'success');
        document.getElementById('addUserForm').style.display = 'none';
        loadAccounts();
      } catch (e) {
        showAlert('Failed to create account', 'error');
      }
    }

    async function deleteAccount(accountId) {
      if (confirm('Are you sure?')) {
        try {
          await fetchAPI(\`/api/accounts/\${accountId}\`, {}, 'DELETE');
          showAlert('Account deleted', 'success');
          loadAccounts();
        } catch (e) {
          showAlert('Failed to delete account', 'error');
        }
      }
    }

    async function fetchAPI(path, body = null, method = 'GET') {
      const token = localStorage.getItem('adminToken');
      const options = {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': \`Bearer \${token}\`,
        },
      };
      if (body) options.body = JSON.stringify(body);
      
      const res = await fetch(path, options);
      if (res.status === 401) {
        logout();
        throw new Error('Unauthorized');
      }
      return res.json();
    }

    function showAlert(message, type = 'info') {
      const container = document.getElementById('alerts');
      const id = Date.now();
      const alert = document.createElement('div');
      alert.className = \`alert alert-\${type}\`;
      alert.textContent = message;
      alert.id = id;
      container.appendChild(alert);
      setTimeout(() => alert.remove(), 3000);
    }
  </script>
</body>
</html>`;
}

// Route handlers
const routes = {
  "POST /api/login": async (req, res, body) => {
    const { password } = body;
    if (password === ADMIN_PASSWORD) {
      const token = generateToken();
      activeSessions.set(token, Date.now());
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ token }));
    } else {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid password" }));
    }
  },

  "GET /api/stats": async (req, res, token) => {
    const ledger = await proxyRequest("/api/ledger");
    const stats = {
      totalAccounts: Object.keys(ledger?.accounts || {}).length,
      totalTransactions: ledger?.transactions?.length || 0,
      totalVolume: Object.values(ledger?.accounts || {}).reduce((sum, acc) => sum + (acc.balance || 0), 0),
      systemHealth: 100,
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(stats));
  },

  "GET /api/status": async (req, res, token) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      uptime: process.uptime().toFixed(2) + "s",
      memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + "MB",
      connections: activeSessions.size,
    }));
  },

  "GET /api/transactions": async (req, res, token) => {
    const data = await proxyRequest("/api/ledger");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ transactions: data?.transactions || [] }));
  },

  "GET /api/accounts": async (req, res, token) => {
    const data = await proxyRequest("/api/ledger");
    const accounts = Object.entries(data?.accounts || {}).map(([id, acc]) => ({
      id,
      name: acc.name || id,
      balance: acc.balance || 0,
    }));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ accounts }));
  },

  "POST /api/accounts": async (req, res, token, body) => {
    const { userId, userName, balance } = body;
    const result = await proxyRequest("/api/accounts", { id: userId, name: userName, balance }, "POST");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
  },

  "DELETE /api/accounts/:id": async (req, res, token, body, params) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true }));
  },

  "GET /api/ledger/proof": async (req, res, token) => {
    const data = await proxyRequest("/api/ledger/proof");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  },
};

// Server
const server = http.createServer(async (req, res) => {
  const { pathname, search } = url.parse(req.url);
  const method = req.method;

  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // Parse body
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const bodyObj = body ? JSON.parse(body) : {};
      const token = req.headers.authorization?.split(" ")[1];

      // Serve dashboard
      if (pathname === "/" && method === "GET") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(getDashboardHTML());
        return;
      }

      // Login doesn't need token
      if (pathname === "/api/login" && method === "POST") {
        routes["POST /api/login"](req, res, bodyObj);
        return;
      }

      // Check token for other API routes
      if (!verifySession(token)) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      // Route matching
      let matched = false;
      for (const [route, handler] of Object.entries(routes)) {
        const [routeMethod, routePath] = route.split(" ");
        const routeRegex = routePath.replace(/:(\w+)/g, "(?<$1>[^/]+)");
        const regex = new RegExp(`^${routeRegex}$`);
        const match = regex.exec(pathname);

        if (match && routeMethod === method) {
          matched = true;
          await handler(req, res, token, bodyObj, match.groups || {});
          break;
        }
      }

      if (!matched) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
      }
    } catch (err) {
      console.error(err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal error" }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 Zarpay Admin Dashboard running on http://localhost:${PORT}`);
  console.log(`📝 Default password: ${ADMIN_PASSWORD}`);
  console.log(`💾 Backend connected to: ${BACKEND_URL}`);
  console.log(`\n⚠️  Set these environment variables for production:`);
  console.log(`   - ADMIN_PASSWORD (change from default)`);
  console.log(`   - BACKEND_URL (your zarpay backend)`);
  console.log(`   - PORT (default: 3000)\n`);
});
