const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const USERS_FILE = path.join(__dirname, 'users.csv');

// 初始化 CSV：必须带 BOM 头 (\ufeff) 才能让 Excel/记事本正确显示中文
if (!fs.existsSync(USERS_FILE)) {
    const header = '\ufeffusername,password_hash,secret_hash,role,email,reg_date,is_used,note\n';
    fs.writeFileSync(USERS_FILE, header, 'utf8');
}

// 通用 CSV 读取函数
function readCSV(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.replace('\ufeff', '').split('\n').filter(line => line.trim() !== '');
        if (lines.length === 0) return [];
        const headers = lines[0].split(',');
        return lines.slice(1).map(line => {
            const values = line.split(',');
            let obj = {};
            headers.forEach((header, i) => obj[header] = values[i]);
            return obj;
        });
    } catch (e) { return []; }
}

// 登录接口
app.post('/api/login', (req, res) => {
    const { username, password_hash, secret_hash } = req.body;
    const users = readCSV(USERS_FILE);
    
    // 1. 基础匹配
    const user = users.find(u => u.username === username && u.password_hash === password_hash);
    if (!user) return res.json({ success: false, message: "Invalid ID or Password" });

    // 2. 机动管理员过期检查
    if (user.role === 'temp_admin' && user.is_used === 'true') {
        return res.json({ success: false, message: "Access Expired (One-time only)" });
    }

    // 3. Secret 校验 (机动管理员或包含 boss/admin 的 ID 必须校验)
    const needsSecret = user.role === 'temp_admin' || user.role === 'developer' || username.toLowerCase().includes('boss');
    if (needsSecret && user.secret_hash !== secret_hash) {
        return res.json({ success: false, message: "Security Secret Mismatch" });
    }

    // 4. 如果是机动管理员，成功后标记为已使用
    if (user.role === 'temp_admin') {
        let rawContent = fs.readFileSync(USERS_FILE, 'utf8');
        let lines = rawContent.split('\n');
        let newContent = lines.map(line => {
            if (line.includes(username) && line.includes('temp_admin')) {
                let parts = line.split(',');
                parts[6] = 'true'; // 将 is_used 设为 true
                return parts.join(',');
            }
            return line;
        }).join('\n');
        fs.writeFileSync(USERS_FILE, newContent, 'utf8');
    }

    res.json({ success: true, user: { username: user.username, role: user.role } });
});

// 生成机动管理员 (支持中文备注)
app.post('/api/generate-temp-admin', (req, res) => {
    const { dev_pass, note } = req.body;
    if (dev_pass !== 'Cmj123456') return res.json({ success: false, message: "Dev Auth Failed" });

    const temp_id = "ADMIN_" + Math.random().toString(36).substring(2, 8).toUpperCase();
    const temp_pass = "PWD_" + Math.random().toString(36).substring(2, 6).toUpperCase();
    const temp_sec = "SEC_" + Math.random().toString(36).substring(2, 6).toUpperCase();

    // 写入新行：使用 UTF-8 确保中文 note 正常
    const newLine = `${temp_id},${temp_pass},${temp_sec},temp_admin,none,${new Date().toLocaleString()},false,${note || 'No Note'}\n`;
    fs.appendFileSync(USERS_FILE, newLine, 'utf8');

    res.json({ success: true, credentials: { temp_id, temp_pass, temp_secret: temp_sec } });
});

// 注册接口
app.post('/api/register', (req, res) => {
    const { username, email, password_hash } = req.body;
    const users = readCSV(USERS_FILE);
    if (users.find(u => u.username === username)) return res.json({ success: false, message: "User exists" });

    const newLine = `${username},${password_hash},,user,${email},${new Date().toLocaleString()},false,Standard User\n`;
    fs.appendFileSync(USERS_FILE, newLine, 'utf8');
    res.json({ success: true });
});

app.listen(3000, () => console.log('>>> SECURE CORE RUNNING ON PORT 3000 <<<'));